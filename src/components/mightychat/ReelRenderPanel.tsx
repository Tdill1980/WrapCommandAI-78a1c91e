import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Video,
  Loader2,
  CheckCircle2,
  Film,
  Type,
  Clock,
  Sparkles,
  Database,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase, contentDB } from "@/integrations/supabase/client";

interface VideoContentPlan {
  hook: string;
  cta: string;
  overlays: Array<{ text: string; time: number; duration: number }>;
  caption: string;
  hashtags: string;
  sourceVideo?: string;
  assetQuery?: string;
  assetId?: string;
}

interface ReelRenderPanelProps {
  videoContent: VideoContentPlan | null;
  onClose?: () => void;
  organizationId?: string;
  initialVideoUrl?: string;
}

export function ReelRenderPanel({ videoContent, onClose, organizationId, initialVideoUrl }: ReelRenderPanelProps) {
  // Use sourceVideo from content if available, then initialVideoUrl prop
  const effectiveInitialUrl = initialVideoUrl || videoContent?.sourceVideo || "";
  const [videoUrl, setVideoUrl] = useState(effectiveInitialUrl);
  const [editedContent, setEditedContent] = useState<VideoContentPlan | null>(null);
  const [isResolvingAsset, setIsResolvingAsset] = useState(false);
  const [assetResolutionStatus, setAssetResolutionStatus] = useState<string | null>(null);

  // Initialize edited content from videoContent prop
  useEffect(() => {
    if (videoContent) {
      setEditedContent(videoContent);
    }
  }, [videoContent]);

  // Resolve asset from ContentBox when assetQuery or assetId is present
  useEffect(() => {
    async function resolveAsset() {
      if (!editedContent || videoUrl) return;
      
      const { assetId, assetQuery } = editedContent;
      if (!assetId && !assetQuery) return;
      
      setIsResolvingAsset(true);
      setAssetResolutionStatus("Searching ContentBox...");
      console.log("[ReelRenderPanel] Resolving asset:", { assetId, assetQuery });
      
      try {
        let resolvedUrl: string | null = null;
        
        // Direct asset ID lookup
        if (assetId) {
          const { data, error } = await contentDB
            .from("content_files")
            .select("file_url, original_filename")
            .eq("id", assetId)
            .single();
          
          if (error) throw error;
          resolvedUrl = data?.file_url || null;
          if (resolvedUrl) {
            setAssetResolutionStatus(`Found: ${data?.original_filename || 'asset'}`);
          }
        }
        
        // Parse and execute asset query
        if (!resolvedUrl && assetQuery) {
          const params = parseAssetQuery(assetQuery);
          console.log("[ReelRenderPanel] Parsed asset query:", params);
          
          let query = contentDB
            .from("content_files")
            .select("id, file_url, original_filename, tags, file_type");
          
          if (params.tags?.length) {
            query = query.contains("tags", params.tags);
          }
          if (params.type) {
            query = query.eq("file_type", params.type);
          }
          if (params.brand) {
            query = query.eq("brand", params.brand);
          }
          
          const { data, error } = await query.limit(params.limit || 1);
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            resolvedUrl = data[0].file_url;
            setAssetResolutionStatus(`Found ${data.length} asset(s): ${data[0].original_filename || 'video'}`);
            console.log("[ReelRenderPanel] Resolved asset from query:", resolvedUrl?.slice(0, 50));
          } else {
            setAssetResolutionStatus("No matching assets found in ContentBox");
          }
        }
        
        if (resolvedUrl) {
          setVideoUrl(resolvedUrl);
          console.log("[ReelRenderPanel] Asset resolved successfully:", resolvedUrl.slice(0, 50));
        }
      } catch (err) {
        console.error("[ReelRenderPanel] Asset resolution failed:", err);
        setAssetResolutionStatus("Failed to resolve asset");
      } finally {
        setIsResolvingAsset(false);
      }
    }
    
    resolveAsset();
  }, [editedContent?.assetId, editedContent?.assetQuery, videoUrl]);

  // Update video URL when initialVideoUrl or sourceVideo changes
  useEffect(() => {
    const newUrl = initialVideoUrl || videoContent?.sourceVideo;
    if (newUrl && !videoUrl) {
      console.log("[ReelRenderPanel] Setting video URL from:", initialVideoUrl ? "initialVideoUrl" : "sourceVideo", newUrl.slice(0, 50));
      setVideoUrl(newUrl);
    }
  }, [initialVideoUrl, videoContent?.sourceVideo]);

  const handleOpenMightyEdit = () => {
    // Transfer video data to sessionStorage for MightyEdit to pick up
    if (videoUrl || editedContent) {
      const preset = {
        attached_assets: videoUrl ? [{ url: videoUrl, type: 'video' }] : [],
        overlays: editedContent?.overlays?.map(o => ({
          text: o.text,
          start: o.time,
          duration: o.duration,
        })) || [],
        headline: editedContent?.hook,
        subtext: editedContent?.cta,
      };
      sessionStorage.setItem('mightyedit_preset', JSON.stringify(preset));
    }
    window.location.href = '/mighty-edit';
  };

  // Don't render if no content plan exists
  if (!videoContent && !editedContent) {
    return null;
  }

  // Show helpful message if no video URL detected and not resolving
  const showNoVideoWarning = !videoUrl && !initialVideoUrl && !isResolvingAsset && !editedContent?.assetQuery && !editedContent?.assetId;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Film className="h-5 w-5 text-primary" />
            Render Video
          </CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
          <>
            {/* Asset Resolution Status */}
            {isResolvingAsset && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">Resolving asset from ContentBox...</span>
                </div>
                {assetResolutionStatus && (
                  <p className="text-xs text-muted-foreground">{assetResolutionStatus}</p>
                )}
              </div>
            )}
            
            {/* Asset Found Status */}
            {!isResolvingAsset && assetResolutionStatus && videoUrl && (editedContent?.assetQuery || editedContent?.assetId) && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 space-y-1">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Database className="h-4 w-4" />
                  <span className="text-sm font-medium">Asset from ContentBox</span>
                </div>
                <p className="text-xs text-muted-foreground">{assetResolutionStatus}</p>
              </div>
            )}
            
            {/* No video warning */}
            {showNoVideoWarning && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Video className="h-4 w-4" />
                  <span className="text-sm font-medium">No video detected</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  To render your reel, either:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Paste a video URL below</li>
                  <li>Or attach a video file in the chat and send another message</li>
                </ul>
              </div>
            )}
            
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5" />
                Video URL
                {initialVideoUrl && videoUrl === initialVideoUrl && (
                  <Badge variant="secondary" className="text-[10px] ml-1 bg-green-500/20 text-green-600">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                    From Chat
                  </Badge>
                )}
              </Label>
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder={initialVideoUrl ? "Video detected from chat" : "Paste video URL from media library..."}
                className={cn("text-sm", showNoVideoWarning && "border-amber-500/50 focus:ring-amber-500/30")}
              />
            </div>

            {/* Content Preview */}
            {editedContent && (
              <div className="space-y-3 rounded-lg bg-muted/50 p-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Hook
                  </Label>
                  <Input
                    value={editedContent.hook}
                    onChange={(e) => setEditedContent(prev => prev ? { ...prev, hook: e.target.value } : null)}
                    className="text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    CTA
                  </Label>
                  <Input
                    value={editedContent.cta}
                    onChange={(e) => setEditedContent(prev => prev ? { ...prev, cta: e.target.value } : null)}
                    className="text-sm"
                  />
                </div>

                {editedContent.overlays.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <Type className="h-3 w-3" />
                      Overlays
                    </Label>
                    <div className="space-y-1">
                      {editedContent.overlays.map((overlay, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px] min-w-[40px] justify-center">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {overlay.time}s
                          </Badge>
                          <span className="flex-1 truncate">{overlay.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Caption
                  </Label>
                  <Textarea
                    value={editedContent.caption}
                    onChange={(e) => setEditedContent(prev => prev ? { ...prev, caption: e.target.value } : null)}
                    className="text-xs min-h-[60px]"
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  {editedContent.hashtags}
                </div>
              </div>
            )}

            <Button
              onClick={handleOpenMightyEdit}
              className="w-full"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Open in MightyEdit
            </Button>
          </>
      </CardContent>
    </Card>
  );
}

// Helper to parse asset query string: "tags=chicago,ppf | type=video | limit=3"
function parseAssetQuery(query: string): {
  tags?: string[];
  type?: string;
  brand?: string;
  limit?: number;
} {
  const result: { tags?: string[]; type?: string; brand?: string; limit?: number } = {};
  
  const parts = query.split("|").map(p => p.trim());
  for (const part of parts) {
    const [key, value] = part.split("=").map(s => s.trim());
    if (!key || !value) continue;
    
    switch (key.toLowerCase()) {
      case "tags":
        result.tags = value.split(",").map(t => t.trim());
        break;
      case "type":
        result.type = value;
        break;
      case "brand":
        result.brand = value;
        break;
      case "limit":
        result.limit = parseInt(value, 10) || 1;
        break;
    }
  }
  
  return result;
}

// Helper to parse VIDEO_CONTENT block from agent message
export function parseVideoContent(message: string): VideoContentPlan | null {
  const videoMatch = message.match(/===VIDEO_CONTENT===([\s\S]*?)===END_VIDEO_CONTENT===/);
  if (!videoMatch) return null;

  const content = videoMatch[1];
  
  const hookMatch = content.match(/hook:\s*(.+?)(?:\n|$)/i);
  const ctaMatch = content.match(/cta:\s*(.+?)(?:\n|$)/i);
  const captionMatch = content.match(/caption:\s*(.+?)(?:\n|$)/i);
  const hashtagsMatch = content.match(/hashtags:\s*(.+?)(?:\n|$)/i);
  const sourceVideoMatch = content.match(/source_video:\s*(.+?)(?:\n|$)/i);
  
  // NEW: Parse asset_query and asset_id
  const assetQueryMatch = content.match(/asset_query:\s*(.+?)(?:\n|$)/i);
  const assetIdMatch = content.match(/asset_id:\s*([a-f0-9-]{36})(?:\n|$)/i);
  
  // Parse overlays
  const overlays: Array<{ text: string; time: number; duration: number }> = [];
  const overlayRegex = /overlay_\d+:\s*(.+?)\s*\|\s*time:\s*(\d+(?:\.\d+)?)\s*\|\s*duration:\s*(\d+(?:\.\d+)?)/gi;
  let match;
  while ((match = overlayRegex.exec(content)) !== null) {
    overlays.push({
      text: match[1].trim(),
      time: parseFloat(match[2]),
      duration: parseFloat(match[3]),
    });
  }

  // Log parsed content for debugging
  console.log("[parseVideoContent] Parsed:", {
    hook: hookMatch?.[1]?.trim(),
    cta: ctaMatch?.[1]?.trim(),
    sourceVideo: sourceVideoMatch?.[1]?.trim(),
    assetQuery: assetQueryMatch?.[1]?.trim(),
    assetId: assetIdMatch?.[1]?.trim(),
    overlayCount: overlays.length,
  });

  return {
    hook: hookMatch?.[1]?.trim() || "",
    cta: ctaMatch?.[1]?.trim() || "",
    overlays,
    caption: captionMatch?.[1]?.trim() || "",
    hashtags: hashtagsMatch?.[1]?.trim() || "",
    sourceVideo: sourceVideoMatch?.[1]?.trim(),
    assetQuery: assetQueryMatch?.[1]?.trim(),
    assetId: assetIdMatch?.[1]?.trim(),
  };
}
