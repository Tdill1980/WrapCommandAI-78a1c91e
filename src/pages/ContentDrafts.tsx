import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Film, Image, Send, Filter, CheckCircle, XCircle, 
  Clock, Eye, Calendar, Loader2, ArrowLeft, Sparkles,
  Play, ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ContentDraft {
  id: string;
  content_type: string;
  platform: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  status: string;
  created_at: string;
  created_by_agent: string | null;
  task_id: string | null;
  scheduled_for: string | null;
  rejection_reason: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  pending_review: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30" },
  approved: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
  rejected: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30" },
  scheduled: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30" },
  published: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
};

const AGENT_COLORS: Record<string, string> = {
  noah: "from-purple-500 to-pink-500",
  emily: "from-amber-500 to-orange-500",
  casey: "from-blue-500 to-cyan-500",
  alex: "from-green-500 to-emerald-500",
  content_agent: "from-indigo-500 to-violet-500",
};

export default function ContentDrafts() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [previewDraft, setPreviewDraft] = useState<ContentDraft | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    try {
      const { data, error } = await contentDB
        .from("content_drafts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setDrafts(data || []);
    } catch (err) {
      console.error("Error fetching content drafts:", err);
      toast.error("Failed to load content drafts");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (draft: ContentDraft) => {
    setActionLoading(draft.id);
    try {
      const { error } = await contentDB
        .from("content_drafts")
        .update({ 
          status: "approved",
          reviewed_at: new Date().toISOString()
        })
        .eq("id", draft.id);

      if (error) throw error;
      toast.success("Content approved!");
      fetchDrafts();
    } catch (err) {
      console.error("Error approving draft:", err);
      toast.error("Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (draft: ContentDraft, reason?: string) => {
    setActionLoading(draft.id);
    try {
      const { error } = await contentDB
        .from("content_drafts")
        .update({ 
          status: "rejected",
          rejection_reason: reason || "Rejected by user",
          reviewed_at: new Date().toISOString()
        })
        .eq("id", draft.id);

      if (error) throw error;
      toast.success("Content rejected");
      fetchDrafts();
    } catch (err) {
      console.error("Error rejecting draft:", err);
      toast.error("Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSchedule = async (draft: ContentDraft) => {
    // Navigate to content calendar with this draft pre-selected
    navigate(`/content-calendar?draft_id=${draft.id}`);
  };

  const filteredDrafts = drafts.filter(d => {
    if (filter === "all") return true;
    if (filter === "pending") return d.status === "pending_review";
    if (filter === "reels") return d.content_type === "reel" || d.content_type === "video";
    if (filter === "ads") return d.content_type === "static_ad" || d.content_type === "ad";
    if (filter === "stories") return d.content_type === "story";
    return true;
  });

  const pendingCount = drafts.filter(d => d.status === "pending_review").length;

  const getAgentName = (agent: string | null) => {
    if (!agent) return "System";
    return agent.charAt(0).toUpperCase() + agent.slice(1);
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "reel":
      case "video":
        return <Film className="w-4 h-4" />;
      case "static_ad":
      case "ad":
        return <Image className="w-4 h-4" />;
      case "story":
        return <Play className="w-4 h-4" />;
      default:
        return <Sparkles className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                Content Drafts
                {pendingCount > 0 && (
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                    {pendingCount} pending
                  </Badge>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and approve AI-created content before publishing
              </p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={setFilter} className="mb-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="all" className="gap-2">
              <Filter className="w-4 h-4" />
              All
              <Badge variant="secondary" className="ml-1">{drafts.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="w-4 h-4" />
              Pending
              <Badge variant="secondary" className="ml-1 bg-yellow-500/20 text-yellow-400">{pendingCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="reels" className="gap-2">
              <Film className="w-4 h-4" />
              Reels
            </TabsTrigger>
            <TabsTrigger value="ads" className="gap-2">
              <Image className="w-4 h-4" />
              Ads
            </TabsTrigger>
            <TabsTrigger value="stories" className="gap-2">
              <Play className="w-4 h-4" />
              Stories
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content Grid */}
        {filteredDrafts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No content drafts</h3>
              <p className="text-sm text-muted-foreground">
                Delegate tasks to agents to create content that will appear here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDrafts.map((draft) => {
              const statusStyle = STATUS_STYLES[draft.status] || STATUS_STYLES.pending_review;
              const agentColor = AGENT_COLORS[draft.created_by_agent?.toLowerCase() || ""] || "from-gray-500 to-gray-600";
              const isLoading = actionLoading === draft.id;

              return (
                <Card 
                  key={draft.id} 
                  className={cn(
                    "overflow-hidden hover:border-primary/50 transition-all cursor-pointer",
                    statusStyle.border
                  )}
                  onClick={() => setPreviewDraft(draft)}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-secondary/50 relative">
                    {draft.thumbnail_url || draft.media_url ? (
                      <img 
                        src={draft.thumbnail_url || draft.media_url || ""} 
                        alt="Content preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {getContentTypeIcon(draft.content_type)}
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <Badge 
                      className={cn(
                        "absolute top-2 right-2",
                        statusStyle.bg, statusStyle.text, statusStyle.border
                      )}
                    >
                      {draft.status.replace("_", " ")}
                    </Badge>

                    {/* Content Type */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1 bg-black/50 backdrop-blur-sm">
                        {getContentTypeIcon(draft.content_type)}
                        {draft.content_type}
                      </Badge>
                      <Badge variant="secondary" className="bg-black/50 backdrop-blur-sm">
                        {draft.platform}
                      </Badge>
                    </div>
                  </div>

                  {/* Content */}
                  <CardContent className="p-4">
                    {/* Agent */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn(
                        "w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold",
                        agentColor
                      )}>
                        {(draft.created_by_agent || "S")[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {getAgentName(draft.created_by_agent)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(draft.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Caption Preview */}
                    {draft.caption && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {draft.caption}
                      </p>
                    )}

                    {/* Actions */}
                    {draft.status === "pending_review" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(draft);
                          }}
                          disabled={isLoading}
                        >
                          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReject(draft);
                          }}
                          disabled={isLoading}
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {draft.status === "approved" && (
                      <Button
                        size="sm"
                        className="w-full gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSchedule(draft);
                        }}
                      >
                        <Calendar className="w-3 h-3" />
                        Schedule
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Preview Dialog */}
        <Dialog open={!!previewDraft} onOpenChange={() => setPreviewDraft(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {previewDraft && getContentTypeIcon(previewDraft.content_type)}
                Content Preview
              </DialogTitle>
              <DialogDescription>
                Created by {getAgentName(previewDraft?.created_by_agent || null)} on{" "}
                {previewDraft && new Date(previewDraft.created_at).toLocaleDateString()}
              </DialogDescription>
            </DialogHeader>

            {previewDraft && (
              <div className="space-y-4">
                {/* Media Preview */}
                <div className="aspect-video bg-secondary rounded-lg overflow-hidden">
                  {previewDraft.media_url ? (
                    previewDraft.content_type === "reel" || previewDraft.content_type === "video" ? (
                      <video 
                        src={previewDraft.media_url} 
                        controls 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img 
                        src={previewDraft.media_url} 
                        alt="Content"
                        className="w-full h-full object-contain"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      No media available
                    </div>
                  )}
                </div>

                {/* Caption */}
                {previewDraft.caption && (
                  <div className="p-3 bg-secondary/50 rounded-lg">
                    <p className="text-sm font-medium text-foreground mb-1">Caption</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {previewDraft.caption}
                    </p>
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Badge variant="secondary">{previewDraft.platform}</Badge>
                  </span>
                  <span className="flex items-center gap-1">
                    <Badge variant="secondary">{previewDraft.content_type}</Badge>
                  </span>
                </div>

                {/* Actions */}
                {previewDraft.status === "pending_review" && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => {
                        handleApprove(previewDraft);
                        setPreviewDraft(null);
                      }}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        handleReject(previewDraft);
                        setPreviewDraft(null);
                      }}
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                  </div>
                )}

                {previewDraft.media_url && (
                  <Button 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={() => window.open(previewDraft.media_url!, "_blank")}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
