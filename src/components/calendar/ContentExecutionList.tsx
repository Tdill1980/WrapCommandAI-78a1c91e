import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, parseISO } from "date-fns";
import { 
  AlertTriangle, CheckCircle2, Clock, Play, 
  ArrowRight, Loader2, Calendar, ExternalLink, Sparkles
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { 
  resolveExecutionTarget, 
  setExecutionContext, 
  buildExecutionRoute,
  normalizeBrand,
  normalizeContentType,
  type ExecutionContext
} from "@/lib/executionResolver";
import { CampaignContentCreator } from "@/components/studio/CampaignContentCreator";
import { isWithinCampaign } from "@/lib/campaign-prompts/january-2026";

interface ContentItem {
  id: string;
  title: string | null;
  brand: string;
  content_type: string;
  platform: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string | null;
  caption: string | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  content_calendar_id: string | null;
}

// Content type configuration
const CONTENT_TYPE_CONFIG: Record<string, { label: string; emoji: string; bgClass: string; textClass: string }> = {
  email: { label: 'Email', emoji: '📧', bgClass: 'bg-purple-500/20', textClass: 'text-purple-400' },
  ig_reel: { label: 'IG Reel', emoji: '📱', bgClass: 'bg-pink-500/20', textClass: 'text-pink-400' },
  fb_reel: { label: 'FB Reel', emoji: '📘', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' },
  meta_ad: { label: 'Meta Ad', emoji: '🎯', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  youtube_short: { label: 'YT Short', emoji: '▶️', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  article: { label: 'Article', emoji: '📰', bgClass: 'bg-indigo-500/20', textClass: 'text-indigo-400' },
  reel: { label: 'Reel', emoji: '🎬', bgClass: 'bg-orange-500/20', textClass: 'text-orange-400' },
  ad: { label: 'Ad', emoji: '💰', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  short: { label: 'Short', emoji: '⚡', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
};

// Brand styling
const BRAND_STYLES: Record<string, { label: string; color: string; bgClass: string }> = {
  wpw: { label: 'WPW', color: 'text-red-400', bgClass: 'border-l-red-500 bg-red-500/10' },
  'ink-edge': { label: 'I&E', color: 'text-indigo-400', bgClass: 'border-l-indigo-600 bg-indigo-600/10' },
  inkedge: { label: 'I&E', color: 'text-indigo-400', bgClass: 'border-l-indigo-600 bg-indigo-600/10' },
  wraptv: { label: 'WrapTV', color: 'text-purple-400', bgClass: 'border-l-purple-500 bg-purple-500/10' },
  wraptvworld: { label: 'WrapTV', color: 'text-purple-400', bgClass: 'border-l-purple-500 bg-purple-500/10' },
};

const getContentTypeKey = (contentType: string, platform: string): string => {
  const ct = contentType.toLowerCase();
  const pl = platform.toLowerCase();
  if (ct === 'reel' && pl === 'instagram') return 'ig_reel';
  if (ct === 'reel' && pl === 'facebook') return 'fb_reel';
  if ((ct === 'ad' || ct === 'reel-ad') && (pl === 'meta' || pl === 'facebook' || pl === 'instagram')) return 'meta_ad';
  if ((ct === 'short') && pl === 'youtube') return 'youtube_short';
  if (ct === 'email') return 'email';
  if (ct === 'article') return 'article';
  return ct;
};

const getBrandStyle = (brand: string) => {
  const key = brand.toLowerCase();
  return BRAND_STYLES[key] || { label: brand, color: 'text-muted-foreground', bgClass: 'border-l-muted bg-muted/10' };
};

export function ContentExecutionList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  
  // Campaign Content Creator state
  const [showCampaignCreator, setShowCampaignCreator] = useState(false);
  const [campaignItem, setCampaignItem] = useState<ContentItem | null>(null);

  // Fetch due/overdue content - using v1 state machine statuses
  const { data: dueContent = [], isLoading } = useQuery({
    queryKey: ['content-execution-due'],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from('content_calendar')
        .select('*')
        .lte('scheduled_date', today)
        .in('status', ['draft', 'in_progress', 'ready'])
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (error) throw error;
      return data as ContentItem[];
    }
  });

  // Fetch tasks linked to calendar items
  const { data: tasks = [] } = useQuery({
    queryKey: ['execution-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, content_calendar_id')
        .not('content_calendar_id', 'is', null);

      if (error) throw error;
      return data as Task[];
    }
  });

  // Map tasks by calendar ID
  const tasksByCalendarId = tasks.reduce((acc, task) => {
    if (task.content_calendar_id) {
      acc[task.content_calendar_id] = task;
    }
    return acc;
  }, {} as Record<string, Task>);

  // Mark as published mutation
  const markPublishedMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await contentDB
        .from('content_calendar')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-execution-due'] });
      queryClient.invalidateQueries({ queryKey: ['content-calendar-30day'] });
      toast.success("Marked as published!");
    },
    onError: () => {
      toast.error("Failed to update status");
    }
  });

  // Group content by status
  const overdue = dueContent.filter(item => {
    const scheduledDate = parseISO(item.scheduled_date);
    return isPast(scheduledDate) && !isToday(scheduledDate);
  });

  const dueToday = dueContent.filter(item => {
    const scheduledDate = parseISO(item.scheduled_date);
    return isToday(scheduledDate);
  });

  const handleCreateNow = async (item: ContentItem) => {
    // ═══════════════════════════════════════════════════════════
    // CAMPAIGN GATE: January 2026 items go to CampaignContentCreator
    // This enforces ONE execution path for campaign content
    // ═══════════════════════════════════════════════════════════
    if (isWithinCampaign(item.scheduled_date)) {
      setCampaignItem(item);
      setShowCampaignCreator(true);
      return;
    }

    // Use the canonical execution resolver (for non-campaign items only)
    const resolution = resolveExecutionTarget(item.brand, item.content_type, item.platform);

    // Update status to in_progress immediately with timestamp
    const { error: updateError } = await contentDB
      .from('content_calendar')
      .update({ 
        status: 'in_progress',
        in_progress_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (updateError) {
      toast.error("Could not start this item");
      return;
    }

    // Invalidate to reflect status change
    queryClient.invalidateQueries({ queryKey: ['content-execution-due'] });
    
    // Build and persist execution context
    const context: ExecutionContext = {
      source: 'content_calendar',
      content_calendar_id: item.id,
      content_type: normalizeContentType(item.content_type),
      platform: item.platform,
      brand: normalizeBrand(item.brand),
      title: item.title || 'Untitled',
      caption: item.caption || '',
      scheduled_date: item.scheduled_date,
    };
    
    setExecutionContext(context);
    
    // Build route and navigate
    const route = buildExecutionRoute(resolution, item.id);
    toast.success(`Starting execution via ${resolution.label}`);
    navigate(route);
  };

  const renderContentItem = (item: ContentItem, isOverdue: boolean) => {
    const contentTypeKey = getContentTypeKey(item.content_type, item.platform);
    const typeConfig = CONTENT_TYPE_CONFIG[contentTypeKey] || { 
      label: item.content_type, 
      emoji: '📌', 
      bgClass: 'bg-muted', 
      textClass: 'text-muted-foreground' 
    };
    const brandStyle = getBrandStyle(item.brand);
    const linkedTask = tasksByCalendarId[item.id];
    const isCampaignItem = isWithinCampaign(item.scheduled_date);
    const isCreated = linkedTask?.status === 'completed';

    const isInProgress = item.status === 'in_progress';
    const isReady = item.status === 'ready' || isCreated;

    return (
      <div
        key={item.id}
        onClick={() => !isReady && handleCreateNow(item)}
        className={cn(
          "flex items-center gap-4 p-3 rounded-lg border-l-4 border transition-all",
          !isReady && "cursor-pointer",
          isCampaignItem && !isReady ? "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30" : "",
          !isCampaignItem && isOverdue && !isReady ? "border-destructive/50 bg-destructive/10" : "",
          !isCampaignItem && !isOverdue && !isReady ? brandStyle.bgClass : "",
          isReady ? "border-green-500/50 bg-green-500/10" : "",
          !isCampaignItem && isInProgress && !isReady ? "border-yellow-500/50 bg-yellow-500/10" : "",
          "hover:ring-1 hover:ring-primary/50"
        )}
      >
        {/* Status Icon */}
        <div className={cn(
          "p-2 rounded-lg shrink-0",
          isReady ? "bg-green-500/20" : isInProgress ? "bg-blue-500/20" : isOverdue ? "bg-destructive/20" : "bg-yellow-500/20"
        )}>
          {isReady ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : isInProgress ? (
            <Play className="w-4 h-4 text-blue-400" />
          ) : isOverdue ? (
            <AlertTriangle className="w-4 h-4 text-destructive" />
          ) : (
            <Clock className="w-4 h-4 text-yellow-400" />
          )}
        </div>

        {/* Content Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isCampaignItem && (
              <Sparkles className="w-3 h-3 text-amber-500" />
            )}
            <span className={cn("text-xs font-medium", brandStyle.color)}>
              {brandStyle.label}
            </span>
            <Badge 
              variant="outline" 
              className={cn("text-[10px]", typeConfig.bgClass, typeConfig.textClass)}
            >
              {typeConfig.emoji} {typeConfig.label}
            </Badge>
            {isCampaignItem && !isReady && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                Campaign
              </Badge>
            )}
            {!isCampaignItem && isOverdue && !isReady && !isInProgress && (
              <Badge variant="destructive" className="text-[10px]">
                Overdue
              </Badge>
            )}
            {isInProgress && !isReady && (
              <Badge variant="outline" className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">
                In Progress
              </Badge>
            )}
            {isReady && (
              <Badge variant="outline" className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">
                Ready
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium text-foreground truncate">
            {item.title || 'Untitled Content'}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(parseISO(item.scheduled_date), 'MMM d')} at {item.scheduled_time || '12:00'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isReady ? (
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                markPublishedMutation.mutate(item.id);
              }}
              disabled={markPublishedMutation.isPending}
            >
              {markPublishedMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              )}
              Mark Published
            </Button>
          ) : isInProgress ? (
            <Button 
              size="sm" 
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                handleCreateNow(item);
              }}
              className="gap-1"
            >
              <ArrowRight className="w-3 h-3" />
              Continue
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant={isCampaignItem ? "default" : "default"}
              onClick={(e) => {
                e.stopPropagation();
                handleCreateNow(item);
              }}
              className={cn("gap-1", isCampaignItem && "bg-amber-600 hover:bg-amber-700")}
            >
              {isCampaignItem ? (
                <>
                  <Sparkles className="w-3 h-3" />
                  Create Draft
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  Create Now
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalDue = dueContent.length;
  const allDone = totalDue === 0;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Content Execution
            {totalDue > 0 && (
              <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">
                {totalDue} due
              </Badge>
            )}
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/content-calendar')}
            className="gap-1"
          >
            Full Calendar
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Create content, then mark as published. Work top to bottom.
        </p>
      </CardHeader>
      <CardContent>
        {allDone ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <p className="font-medium text-foreground">All caught up!</p>
            <p className="text-sm text-muted-foreground">No content due today or overdue.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-4">
              {/* Overdue Section */}
              {overdue.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <h3 className="text-sm font-semibold text-destructive">
                      Overdue ({overdue.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {overdue.map(item => renderContentItem(item, true))}
                  </div>
                </div>
              )}

              {/* Due Today Section */}
              {dueToday.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-sm font-semibold text-yellow-400">
                      Due Today ({dueToday.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {dueToday.map(item => renderContentItem(item, false))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Campaign Content Creator Modal */}
      <CampaignContentCreator
        open={showCampaignCreator}
        onOpenChange={setShowCampaignCreator}
        calendarItem={campaignItem ? {
          id: campaignItem.id,
          title: campaignItem.title || 'Untitled',
          brand: campaignItem.brand,
          content_type: campaignItem.content_type,
          platform: campaignItem.platform,
          scheduled_date: campaignItem.scheduled_date,
          directive: campaignItem.caption || '',
          locked_metadata: null,
        } : null}
        organizationId={null}
        onDraftSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['content-execution-due'] });
          queryClient.invalidateQueries({ queryKey: ['content-calendar-30day'] });
          setShowCampaignCreator(false);
          setCampaignItem(null);
        }}
      />
    </Card>
  );
}
