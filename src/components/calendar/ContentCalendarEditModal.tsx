import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Sparkles, 
  Calendar, 
  Edit, 
  Check, 
  X, 
  Loader2,
  Image,
  Video,
  FileText,
  BookOpen,
  Wand2,
  ExternalLink,
  Settings,
  MessageSquare
} from "lucide-react";
import { ContentMetadataPanel, ContentMetadata } from "@/components/content/ContentMetadataPanel";
import { supabase, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { getAgentForContentType } from "@/hooks/useCalendarTaskSync";
import { isWithinCampaign } from "@/lib/campaign-prompts/january-2026";

interface ScheduledContent {
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

interface ContentCalendarEditModalProps {
  content: ScheduledContent | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  isContentCreated?: boolean;
}

const CONTENT_TYPES = [
  { value: 'reel', label: 'Reel', icon: Video },
  { value: 'story', label: 'Story', icon: Video },
  { value: 'static', label: 'Static Post', icon: Image },
  { value: 'carousel', label: 'Carousel', icon: Image },
  { value: 'article', label: 'Article', icon: FileText },
  { value: 'magazine', label: 'Magazine Content', icon: BookOpen },
  { value: 'email', label: 'Email', icon: FileText },
  { value: 'ad', label: 'Meta Ad', icon: Video },
];

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'email', label: 'Email' },
  { value: 'magazine', label: 'Magazine' },
];

const STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-muted text-muted-foreground' },
  { value: 'ready', label: 'Ready to Post', color: 'bg-green-500/20 text-green-400' },
  { value: 'needs_design', label: 'Needs Design', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'posted', label: 'Posted', color: 'bg-purple-500/20 text-purple-400' },
];

export function ContentCalendarEditModal({ 
  content, 
  open, 
  onClose, 
  onUpdate,
  isContentCreated = false
}: ContentCalendarEditModalProps) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  
  const [title, setTitle] = useState(content?.title || "");
  const [caption, setCaption] = useState(content?.caption || "");
  const [contentType, setContentType] = useState(content?.content_type || "reel");
  const [platform, setPlatform] = useState(content?.platform || "instagram");
  const [status, setStatus] = useState(content?.status || "draft");
  
  const [contentMetadata, setContentMetadata] = useState<ContentMetadata>({
    brand: content?.brand || "wpw",
    channel: "",
    contentPurpose: "organic",
    platform: content?.platform || "instagram",
    contentType: content?.content_type || "reel",
  });

  // Update metadata when content changes
  useEffect(() => {
    if (content) {
      setTitle(content.title || "");
      setCaption(content.caption || "");
      setContentType(content.content_type || "reel");
      setPlatform(content.platform || "instagram");
      setStatus(content.status || "draft");
      setContentMetadata(prev => ({
        ...prev,
        brand: content.brand || "wpw",
        platform: content.platform || "instagram",
        contentType: content.content_type || "reel",
      }));
    }
  }, [content]);

  if (!content) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await contentDB
        .from('content_calendar')
        .update({
          title,
          caption,
          content_type: contentType,
          platform,
          status,
        })
        .eq('id', content.id);

      if (error) throw error;
      toast.success("Content updated!");
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      console.error('Update error:', err);
      toast.error("Failed to update content");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateWithAI = async () => {
    setIsGenerating(true);
    try {
      // Navigate to appropriate creator based on content type, passing full AutoCreateInput contract
      if (contentType === 'reel' || contentType === 'story') {
        // ============ DETERMINISTIC AUTO-CREATE ============
        // Pass the EXACT calendar data to ReelBuilder - no guessing, no defaults
        navigate('/organic/reel-builder', {
          state: {
            autoCreate: true,
            autoCreateInput: {
              source: 'content_calendar' as const,
              calendarId: content.id,
              contentType: contentType as 'reel' | 'story',
              platform: platform as 'instagram' | 'tiktok' | 'youtube' | 'facebook',
              topic: title || caption || 'Untitled',  // THE EXACT calendar copy
              hook: caption?.split('\n')[0] || title || undefined,  // First line as hook
              cta: 'Follow for more',
              style: 'dara' as const,
              musicStyle: 'upbeat' as const,
              captionStyle: 'dara' as const,
              brand: content.brand,
            },
          },
        });
      } else if (contentType === 'static' || contentType === 'carousel') {
        navigate('/organic/static-creator', { 
          state: { 
            calendarItem: content,
            autoGenerate: true,
            metadata: contentMetadata,
          } 
        });
      } else if (contentType === 'magazine' || contentType === 'article') {
        navigate('/contentbox', { 
          state: { 
            calendarItem: content,
            autoGenerate: true,
            metadata: contentMetadata,
            contentType: 'magazine' 
          } 
        });
      } else {
        navigate('/contentbox', { 
          state: { 
            calendarItem: content,
            autoGenerate: true,
            metadata: contentMetadata,
          } 
        });
      }
      onClose();
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusInfo = () => {
    return STATUSES.find(s => s.value === status) || STATUSES[0];
  };

  const getContentTypeIcon = () => {
    const ct = CONTENT_TYPES.find(c => c.value === contentType);
    return ct?.icon || Video;
  };

  const ContentTypeIcon = getContentTypeIcon();
  const statusInfo = getStatusInfo();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {isEditing ? "Edit Content" : "Content Details"}
          </DialogTitle>
          <DialogDescription>
            Scheduled for {content.scheduled_date} at {content.scheduled_time}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Banner */}
          <div className={`flex items-center justify-between p-3 rounded-lg ${statusInfo.color}`}>
            <div className="flex items-center gap-2">
              {isContentCreated ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <X className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-sm font-medium">
                {isContentCreated ? "Content Created" : "Content Not Created"}
              </span>
            </div>
            <Badge variant="secondary" className={statusInfo.color}>
              {statusInfo.label}
            </Badge>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            {isEditing ? (
              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Content title..."
              />
            ) : (
              <p className="text-sm p-2 bg-muted rounded-lg">
                {content.title || "Untitled"}
              </p>
            )}
          </div>

          {/* Content Type & Platform */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Content Type</Label>
              {isEditing ? (
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map(ct => (
                      <SelectItem key={ct.value} value={ct.value}>
                        <div className="flex items-center gap-2">
                          <ct.icon className="w-4 h-4" />
                          {ct.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <ContentTypeIcon className="w-4 h-4" />
                  <span className="text-sm capitalize">{content.content_type}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              {isEditing ? (
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm p-2 bg-muted rounded-lg capitalize">
                  {content.platform}
                </p>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            {isEditing ? (
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
            )}
          </div>

          {/* Caption */}
          <div className="space-y-2">
            <Label>Caption / Notes</Label>
            {isEditing ? (
              <Textarea 
                value={caption} 
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add caption or notes..."
                className="min-h-[100px]"
              />
            ) : (
              <p className="text-sm p-2 bg-muted rounded-lg min-h-[60px]">
                {content.caption || "No caption yet"}
              </p>
            )}
          </div>

          {/* Content Metadata Toggle */}
          <div className="pt-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowMetadata(!showMetadata)}
              className="w-full"
            >
              <Settings className="w-4 h-4 mr-2" />
              {showMetadata ? "Hide" : "Show"} Brand & Channel Settings
            </Button>
            
            {showMetadata && (
              <div className="mt-3">
                <ContentMetadataPanel 
                  metadata={contentMetadata} 
                  onChange={setContentMetadata}
                  showContentType
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-4 border-t">
            {isEditing ? (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(true)}
                  className="w-full"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Details
                </Button>

                {!isContentCreated && (
                  <>
                    {/* Campaign items: Show Campaign Studio button, hide agent execution */}
                    {isWithinCampaign(content.scheduled_date) ? (
                      <Button 
                        onClick={() => {
                          // Navigate to content calendar where CampaignContentCreator will open
                          navigate('/content-calendar', {
                            state: {
                              openCampaign: true,
                              calendarId: content.id,
                              scheduledDate: content.scheduled_date
                            }
                          });
                          onClose();
                        }}
                        className="w-full bg-amber-600 hover:bg-amber-700"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Create in Campaign Studio
                      </Button>
                    ) : (
                      <>
                        <Button 
                          onClick={() => {
                            // Route to agent chat with calendar context (non-campaign only)
                            const agentId = getAgentForContentType(contentType);
                            const context = {
                              source: 'content_calendar',
                              calendar_id: content.id,
                              content_type: contentType,
                              platform,
                              brand: content.brand,
                              title: title || 'Untitled',
                              caption: caption || '',
                              scheduled_date: content.scheduled_date,
                            };
                            sessionStorage.setItem('agent_chat_context', JSON.stringify(context));
                            navigate(`/mightytask?agent=${agentId}&calendarId=${content.id}`);
                            onClose();
                          }}
                          className="w-full"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Execute with Agent
                        </Button>

                        <Button 
                          variant="outline"
                          onClick={handleGenerateWithAI}
                          disabled={isGenerating}
                          className="w-full"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Wand2 className="w-4 h-4 mr-2" />
                          )}
                          Quick Create (Skip Agent)
                        </Button>
                      </>
                    )}
                  </>
                )}

                {isContentCreated && (
                  <Button 
                    variant="secondary"
                    onClick={() => {
                      navigate('/contentbox');
                      onClose();
                    }}
                    className="w-full"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Created Content
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
