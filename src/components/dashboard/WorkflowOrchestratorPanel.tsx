import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  AlertTriangle, Calendar, MessageSquare, TrendingUp, 
  Target, CheckCircle, ArrowRight, Loader2, Play,
  AlertCircle, Clock, Sparkles, Film, ListTodo
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { OrchestratorQuickActions } from "./OrchestratorQuickActions";

interface OrchestratorStep {
  id: string;
  priority: number;
  title: string;
  description: string;
  count?: number;
  status: "todo" | "in_progress" | "done";
  severity: "blocking" | "important" | "routine";
  cta_label: string;
  cta_href: string;
  icon: typeof AlertTriangle;
}

const SEVERITY_STYLES = {
  blocking: "border-destructive/50 bg-destructive/10",
  important: "border-yellow-500/50 bg-yellow-500/10",
  routine: "border-border bg-secondary/30",
};

const SEVERITY_BADGE = {
  blocking: "bg-destructive/20 text-destructive border-destructive/30",
  important: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  routine: "bg-muted text-muted-foreground border-border",
};

export function WorkflowOrchestratorPanel() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<OrchestratorStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDone, setIsDone] = useState(false);

  const fetchOrchestratorData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const orchestratorSteps: OrchestratorStep[] = [];

      // P0: Blocking Issues
      const { count: blockersCount } = await supabase
        .from("system_issues")
        .select("*", { count: 'exact', head: true })
        .eq("impact", "blocking")
        .neq("status", "resolved");

      if (blockersCount && blockersCount > 0) {
        orchestratorSteps.push({
          id: "blockers",
          priority: 0,
          title: "Resolve Blocking Issues",
          description: `${blockersCount} issue${blockersCount > 1 ? 's' : ''} preventing normal work`,
          count: blockersCount,
          status: "todo",
          severity: "blocking",
          cta_label: "View Issues",
          cta_href: "/issues?impact=blocking&status=open",
          icon: AlertTriangle,
        });
      }

      // P1: Pending AI Approvals
      const { count: approvalsCount } = await supabase
        .from("ai_actions")
        .select("*", { count: 'exact', head: true })
        .eq("resolved", false);

      if (approvalsCount && approvalsCount > 0) {
        orchestratorSteps.push({
          id: "approvals",
          priority: 1,
          title: "Review AI Approvals",
          description: `${approvalsCount} item${approvalsCount > 1 ? 's' : ''} waiting for approval`,
          count: approvalsCount,
          status: "todo",
          severity: "important",
          cta_label: "Review Now",
          cta_href: "/ai-approvals",
          icon: Sparkles,
        });
      }

      // P1.25: Pending Content Drafts
      const { count: draftsCount } = await contentDB
        .from("content_drafts")
        .select("*", { count: 'exact', head: true })
        .eq("status", "pending_review");

      if (draftsCount && draftsCount > 0) {
        orchestratorSteps.push({
          id: "content_drafts",
          priority: 1.25,
          title: "Review AI Content Drafts",
          description: `${draftsCount} content piece${draftsCount > 1 ? 's' : ''} ready to review`,
          count: draftsCount,
          status: "todo",
          severity: "important",
          cta_label: "Review",
          cta_href: "/content-drafts",
          icon: Film,
        });
      }

      // P1.3: Backlog Items
      const { count: backlogCount } = await supabase
        .from("ai_actions")
        .select("*", { count: 'exact', head: true })
        .eq("action_type", "create_task")
        .eq("resolved", false);

      if (backlogCount && backlogCount > 0) {
        orchestratorSteps.push({
          id: "backlog",
          priority: 1.3,
          title: "Process Backlog Items",
          description: `${backlogCount} task${backlogCount > 1 ? 's' : ''} awaiting action`,
          count: backlogCount,
          status: "todo",
          severity: "routine",
          cta_label: "View Backlog",
          cta_href: "/backlog",
          icon: ListTodo,
        });
      }

      // P1.5: Pending Content (scheduled for today or overdue)
      const { count: dueContentCount } = await contentDB
        .from("content_calendar")
        .select("*", { count: 'exact', head: true })
        .lte("scheduled_date", today)
        .in("status", ["draft", "pending_review", "scheduled"]);

      if (dueContentCount && dueContentCount > 0) {
        orchestratorSteps.push({
          id: "publish",
          priority: 2,
          title: "Publish Scheduled Content",
          description: `${dueContentCount} item${dueContentCount > 1 ? 's' : ''} due today or overdue`,
          count: dueContentCount,
          status: "todo",
          severity: "important",
          cta_label: "Execute Now",
          cta_href: "/content-calendar?mode=execute",
          icon: Calendar,
        });
      }

      // P2: Unread Priority DMs / Inbox
      const { count: unreadCount } = await supabase
        .from("conversations")
        .select("*", { count: 'exact', head: true })
        .gt("unread_count", 0)
        .in("channel", ["instagram", "website_chat", "email"]);

      if (unreadCount && unreadCount > 0) {
        orchestratorSteps.push({
          id: "inbox",
          priority: 3,
          title: "Clear Priority Inbox",
          description: `${unreadCount} conversation${unreadCount > 1 ? 's' : ''} with unread messages`,
          count: unreadCount,
          status: "todo",
          severity: unreadCount > 5 ? "important" : "routine",
          cta_label: "Open Inbox",
          cta_href: "/mightychat",
          icon: MessageSquare,
        });
      }

      // P3: Ads Health Check (simplified - check if any ads exist)
      const { count: activeAdsCount } = await supabase
        .from("ad_performance")
        .select("*", { count: 'exact', head: true })
        .gte("date_range_end", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      // Always show ads check as routine if there are no recent records
      if (!activeAdsCount || activeAdsCount === 0) {
        orchestratorSteps.push({
          id: "ads_health",
          priority: 4,
          title: "Ads Health Check",
          description: "Confirm campaigns are live and performing",
          status: "todo",
          severity: "routine",
          cta_label: "Check Ads",
          cta_href: "/ads-center",
          icon: TrendingUp,
        });
      }

      // P4: Weekly Targets (check content creation)
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      
      const { count: weeklyContentCount } = await contentDB
        .from("content_calendar")
        .select("*", { count: 'exact', head: true })
        .gte("created_at", weekStart.toISOString())
        .eq("status", "published");

      const targetWeeklyContent = 5; // Target: 5 pieces per week
      if (!weeklyContentCount || weeklyContentCount < targetWeeklyContent) {
        const remaining = targetWeeklyContent - (weeklyContentCount || 0);
        orchestratorSteps.push({
          id: "weekly_targets",
          priority: 5,
          title: "Hit Weekly Content Target",
          description: `${remaining} more piece${remaining > 1 ? 's' : ''} needed this week`,
          count: remaining,
          status: "todo",
          severity: "routine",
          cta_label: "Create Content",
          cta_href: "/contentbox",
          icon: Target,
        });
      }

      // Sort by priority
      orchestratorSteps.sort((a, b) => a.priority - b.priority);

      // If no steps, we're done for today
      if (orchestratorSteps.length === 0) {
        setIsDone(true);
      } else {
        setIsDone(false);
      }

      setSteps(orchestratorSteps);
    } catch (err) {
      console.error("Error fetching orchestrator data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrchestratorData();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchOrchestratorData, 60000);
    return () => clearInterval(interval);
  }, [fetchOrchestratorData]);

  const handleGoToNext = () => {
    if (steps.length > 0) {
      navigate(steps[0].cta_href);
    }
  };

  if (loading) {
    return (
      <Card className="dashboard-card border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            Workflow Orchestrator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Done state
  if (isDone) {
    return (
      <Card className="dashboard-card border-green-500/30 bg-gradient-to-br from-green-500/10 to-transparent">
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Today Complete!</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              All required actions are finished. You're done for today.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-card border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Play className="w-5 h-5 text-primary" />
              Workflow Orchestrator
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                {steps.length} steps
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Work top to bottom. When done, you're done.
            </p>
          </div>
          <Button 
            onClick={handleGoToNext}
            size="sm"
            className="gap-2"
          >
            Go To Next Action
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Quick Actions Bar */}
        <div className="pb-3 border-b border-border/50">
          <p className="text-xs text-muted-foreground mb-2">Quick Actions</p>
          <OrchestratorQuickActions />
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps.slice(0, 5).map((step, index) => {
            const IconComponent = step.icon;
            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-4 p-3 rounded-lg border transition-all",
                  SEVERITY_STYLES[step.severity],
                  "hover:border-primary/50 cursor-pointer"
                )}
                onClick={() => navigate(step.cta_href)}
              >
                {/* Step Number */}
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  step.severity === "blocking" ? "bg-destructive/30 text-destructive" :
                  step.severity === "important" ? "bg-yellow-500/30 text-yellow-400" :
                  "bg-muted text-muted-foreground"
                )}>
                  {index + 1}
                </div>

                {/* Icon */}
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  step.severity === "blocking" ? "bg-destructive/20 text-destructive" :
                  step.severity === "important" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-muted text-muted-foreground"
                )}>
                  <IconComponent className="w-4 h-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {step.title}
                    </span>
                    {step.count !== undefined && (
                      <Badge 
                        variant="outline" 
                        className={cn("text-[10px] shrink-0", SEVERITY_BADGE[step.severity])}
                      >
                        {step.count}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {step.description}
                  </p>
                </div>

                {/* CTA */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(step.cta_href);
                  }}
                >
                  {step.cta_label}
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
