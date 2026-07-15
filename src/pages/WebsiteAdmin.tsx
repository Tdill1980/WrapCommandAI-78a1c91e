import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, MessageSquare, FileText, Loader2, AlertTriangle, FileImage, ExternalLink, FileSearch } from "lucide-react";
import { AnalyticsTab } from "@/components/admin/jordan-dashboard/AnalyticsTab";
import { ChatSessionsTab } from "@/components/admin/jordan-dashboard/ChatSessionsTab";
import { QuotesTab } from "@/components/admin/jordan-dashboard/QuotesTab";
import { WrapGuruTab } from "@/components/admin/jordan-dashboard/WrapGuruTab";
import { ArtworkReviewsPanel } from "@/components/admin/ArtworkReviewsPanel";
import { MainLayout } from "@/layouts/MainLayout";
import { Session } from "@supabase/supabase-js";

// MVP CORE TABS ONLY — No emails (V2), no systems, escalations moved to /escalations
const TABS = [
  { id: "chats", label: "Website Chat", icon: MessageSquare, color: "bg-blue-500" },
  { id: "artwork", label: "Artwork Reviews", icon: FileImage, color: "bg-purple-500" },
  { id: "quotes", label: "Quotes", icon: FileText, color: "bg-indigo-500" },
  { id: "wrapguru", label: "WrapGuru", icon: FileSearch, color: "bg-pink-500" },
  { id: "analytics", label: "Analytics", icon: BarChart3, color: "bg-green-500" },
];

export default function JordanLeeAdminDashboard() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "chats";
  const initialFilter = searchParams.get("filter"); // "hot" for hot leads filter
  const [activeTab, setActiveTab] = useState(initialTab);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orgMembership, setOrgMembership] = useState<{
    organizationId: string;
    organizationName: string;
    role: string;
  } | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Auth state management
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Organization membership check
  useEffect(() => {
    if (!session) return;

    const checkMembership = async () => {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(name)")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!membership) {
        setAccessDenied(true);
      } else {
        const orgData = membership.organizations as { name: string } | null;
        setOrgMembership({
          organizationId: membership.organization_id,
          organizationName: orgData?.name || "Unknown Organization",
          role: membership.role
        });
      }
    };

    checkMembership();
  }, [session]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to logout. Please try again.",
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No session - redirect to auth
  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // Access denied - no org membership
  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              You are not a member of any organization. Contact an administrator for access.
            </p>
            <Button onClick={handleLogout} variant="outline">
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Website Page Chat — <span className="text-primary">WePrintWraps.com</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor and manage live website chat conversations from weprintwraps.com
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
              onClick={() => navigate('/escalations')}
            >
              <AlertTriangle className="h-4 w-4" />
              Escalations Dashboard
              <ExternalLink className="h-3 w-3" />
            </Button>
            {orgMembership && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                {orgMembership.organizationName} ({orgMembership.role})
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Colorful Tab Bar */}
          <TabsList className="flex flex-wrap gap-2 h-auto bg-transparent p-0 justify-start">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isHighlight = (tab as any).highlight;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                    data-[state=active]:text-white data-[state=active]:${tab.color}
                    data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground
                    data-[state=inactive]:hover:bg-muted/80
                    ${isHighlight && activeTab !== tab.id ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-background animate-pulse' : ''}
                  `}
                  style={{
                    backgroundColor: activeTab === tab.id ? undefined : undefined,
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab Contents — MVP CORE ONLY */}

          <TabsContent value="chats" className="mt-6">
            <ChatSessionsTab 
              initialConversationId={pendingConversationId} 
              onConversationOpened={() => setPendingConversationId(null)}
              initialFilter={initialFilter}
            />
          </TabsContent>


          <TabsContent value="artwork" className="mt-6">
            <ArtworkReviewsPanel />
          </TabsContent>

          <TabsContent value="quotes" className="mt-6">
            <QuotesTab />
          </TabsContent>

          <TabsContent value="wrapguru" className="mt-6">
            <WrapGuruTab />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
