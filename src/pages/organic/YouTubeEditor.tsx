import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Youtube,
  Upload,
  Clock,
  Scissors,
  Sparkles,
  Video,
  ListVideo,
  Zap,
  Package,
  RotateCcw,
  Wand2,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import { useYouTubeEditor, GeneratedShort } from "@/hooks/useYouTubeEditor";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { YouTubeProcessingStatus } from "@/components/youtube/YouTubeProcessingStatus";
import { SceneTimeline } from "@/components/youtube/SceneTimeline";
import { ShortPreviewCard } from "@/components/youtube/ShortPreviewCard";
import { LongFormEnhancementPanel } from "@/components/youtube/LongFormEnhancementPanel";

/** Read a video File's duration (seconds) from metadata. 0 if unreadable. */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    v.src = url;
  });
}

export default function YouTubeEditor() {
  const navigate = useNavigate();
  const YT = useYouTubeEditor();
  const { organizationId } = useOrganization();

  // The storage URL of the uploaded source (null when analyzing a pasted URL —
  // rendering clips requires an uploaded file Mux can ingest).
  const [sourceFileUrl, setSourceFileUrl] = useState<string | null>(null);
  const [renderedUrls, setRenderedUrls] = useState<Record<string, string>>({});
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const muxAssetRef = useRef<{ assetId: string; playbackId?: string } | null>(null);

  // Wire the Analyze button to the REAL pipeline (this used to run a 1.5s
  // setTimeout demo over hardcoded stats).
  const handleAnalyze = async () => {
    try {
      if (YT.uploadedFile) {
        // Upload the file to storage, then analyze the public URL
        const file = YT.uploadedFile;
        const fileName = `youtube-editor/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        toast("Uploading video…");
        const { error: uploadError } = await supabase.storage
          .from("media-library")
          .upload(fileName, file);
        if (uploadError) {
          toast.error(`Upload failed: ${uploadError.message}`);
          return;
        }
        const { data: urlData } = supabase.storage.from("media-library").getPublicUrl(fileName);
        const duration = await getVideoDuration(file);
        setSourceFileUrl(urlData.publicUrl);
        muxAssetRef.current = null;
        await YT.uploadAndAnalyze(urlData.publicUrl, organizationId || undefined, duration || undefined);
      } else if (YT.videoUrl.trim()) {
        // Pasted URL — transcription handles YouTube/social links server-side.
        // Clip rendering needs an uploaded file, so it stays disabled.
        setSourceFileUrl(null);
        await YT.uploadAndAnalyze(YT.videoUrl.trim(), organizationId || undefined);
      } else {
        toast.error("Paste a video URL or upload a file first");
      }
    } catch (err) {
      console.error("Analyze failed:", err);
      toast.error("Failed to start analysis");
    }
  };

  // Render one short as a real Mux clip (same proven flow as Auto-Split)
  const handleRenderShort = async (short: GeneratedShort): Promise<string | null> => {
    if (!sourceFileUrl) {
      toast.error("Rendering needs an uploaded video file (not a pasted link)");
      return null;
    }
    if (short.start === undefined || short.end === undefined) {
      toast.error("This short has no clip timing");
      return null;
    }
    setRenderingIds((prev) => new Set(prev).add(short.id));
    try {
      if (!muxAssetRef.current) {
        const { data: muxData, error: muxError } = await lovableFunctions.functions.invoke("mux-upload", {
          body: { file_url: sourceFileUrl },
        });
        if (muxError) throw new Error(muxError.message);
        if (!muxData?.asset_id) throw new Error("No Mux asset id returned");
        muxAssetRef.current = { assetId: muxData.asset_id, playbackId: muxData.playback_id };
      }
      const { data: clipData, error: clipError } = await lovableFunctions.functions.invoke("mux-create-clip", {
        body: {
          asset_id: muxAssetRef.current.assetId,
          playback_id: muxAssetRef.current.playbackId,
          start_time: short.start,
          end_time: short.end,
          output_name: short.title,
          create_permanent: true,
        },
      });
      if (clipError) throw new Error(clipError.message);
      const url = clipData?.download_url || clipData?.playback_url;
      if (!url) throw new Error("Clip created but no URL returned");

      // Persist to the Media Library
      const { error: cfError } = await contentDB.from("content_files").insert({
        file_url: url,
        file_type: "video",
        source: "youtube_editor",
        original_filename: `${short.title}.mp4`,
        thumbnail_url: clipData?.thumbnail_url || null,
        duration_seconds: Math.round(short.end - short.start),
        tags: ["youtube-editor", "short"],
        ai_labels: { hook: short.hook, virality_score: short.virality_score },
      });
      if (cfError) console.error("Failed to save short to media library:", cfError);

      setRenderedUrls((prev) => ({ ...prev, [short.id]: url }));
      toast.success(`Rendered: ${short.title}`);
      return url;
    } catch (err) {
      console.error("Render failed:", err);
      toast.error(`Failed to render: ${short.title}`);
      return null;
    } finally {
      setRenderingIds((prev) => {
        const next = new Set(prev);
        next.delete(short.id);
        return next;
      });
    }
  };

  const handleRenderAll = async () => {
    for (const short of YT.shorts) {
      if (!renderedUrls[short.id]) {
        await handleRenderShort(short);
      }
    }
  };

  const handleScheduleShort = async (short: GeneratedShort) => {
    const { error } = await contentDB.from("content_queue").insert({
      content_type: "reel",
      status: "draft",
      title: short.title,
      caption: short.hook || "",
      output_url: renderedUrls[short.id] || null,
      brand: "wpw",
      channel: "organic",
      mode: "auto",
      ai_metadata: {
        source: "youtube_editor",
        start: short.start,
        end: short.end,
        virality_score: short.virality_score,
        overlay_suggestions: short.overlay_suggestions,
        cta: short.cta,
      },
    });
    if (error) {
      console.error("Schedule failed:", error);
      toast.error(`Failed to schedule: ${short.title}`);
      return false;
    }
    return true;
  };

  const handleScheduleAll = async () => {
    let ok = 0;
    for (const short of YT.shorts) {
      if (await handleScheduleShort(short)) ok += 1;
    }
    if (ok > 0) toast.success(`${ok} short${ok === 1 ? "" : "s"} added to the scheduler`);
  };

  return (
    <div className="p-6 mx-auto max-w-7xl space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/organic")} className="flex items-center gap-2">
            <ArrowLeft className="w-5 h-5" /> Back
          </Button>

          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-transparent flex items-center gap-2">
            <Youtube className="w-8 h-8 text-pink-500" /> YouTube AI Editor
          </h1>
        </div>

        {YT.isAnalyzed && (
          <Button variant="outline" onClick={YT.reset} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Start Over
          </Button>
        )}
      </div>

      <p className="text-muted-foreground">
        Turn long-form YouTube content into high-performing shorts, reels, ads, and posts.
      </p>

      {/* INPUT BAR */}
      <Card className="border border-border bg-card overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-pink-500 to-orange-500" />
        <CardHeader>
          <CardTitle className="text-lg">Upload or Paste YouTube Link</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Paste YouTube URL..."
              value={YT.videoUrl}
              onChange={(e) => YT.setVideoUrl(e.target.value)}
              className="flex-1"
            />

            <Button
              onClick={handleAnalyze}
              disabled={YT.isAnalyzing}
              className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white border-0"
            >
              {YT.isAnalyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Youtube className="w-4 h-4 mr-2" />
              )}
              Analyze
            </Button>
          </div>

          <div
            className="border border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 hover:border-pink-500/50 transition-all group"
            onClick={() => document.getElementById("yt-file")?.click()}
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground group-hover:text-pink-500 transition-colors" />
            <p className="text-muted-foreground group-hover:text-foreground transition-colors">
              Upload MP4 / MOV
            </p>
            {YT.uploadedFile && (
              <p className="text-sm text-pink-500 mt-2">{YT.uploadedFile.name}</p>
            )}
            <input
              id="yt-file"
              type="file"
              className="hidden"
              accept="video/*"
              onChange={(e) => YT.setUploadedFile(e.target.files?.[0] || null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* PROCESSING STATUS */}
      <YouTubeProcessingStatus isAnalyzing={YT.isAnalyzing} processingStatus={YT.processingStatus} />

      {/* ANALYSIS DASHBOARD */}
      {YT.isAnalyzed && (
        <Card className="border border-border bg-card animate-fade-in">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-500" />
              Analysis Overview
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-3 md:grid-cols-6 gap-4">
            <StatCard label="Duration" value={YT.analysis.duration} icon={<Clock className="w-5 h-5" />} />
            <StatCard label="Scenes" value={String(YT.analysis.scenes)} icon={<ListVideo className="w-5 h-5" />} />
            <StatCard label="Energy Spikes" value={String(YT.analysis.spikes)} icon={<Zap className="w-5 h-5" />} />
            <StatCard label="Shorts Found" value={String(YT.analysis.shorts)} icon={<Video className="w-5 h-5" />} />
            <StatCard label="Hook Score" value={`${YT.analysis.hookScore}%`} icon={<Scissors className="w-5 h-5" />} highlight />
            <StatCard label="Products" value={String(YT.analysis.productMentions)} icon={<Package className="w-5 h-5" />} />
          </CardContent>
        </Card>
      )}

      {/* SCENE TIMELINE */}
      {YT.isAnalyzed && YT.scenes.length > 0 && (
        <SceneTimeline
          scenes={YT.scenes}
          onSceneClick={YT.setSelectedScene}
          selectedSceneId={YT.selectedScene?.id}
        />
      )}

      {/* TABS FOR SHORTS AND ENHANCEMENTS */}
      {YT.isAnalyzed && (
        <Tabs defaultValue="shorts" className="animate-fade-in">
          <TabsList className="mb-4">
            <TabsTrigger value="shorts" className="gap-2">
              <Video className="w-4 h-4" />
              Shorts ({YT.shorts.length})
            </TabsTrigger>
            <TabsTrigger value="enhancements" className="gap-2">
              <Wand2 className="w-4 h-4" />
              Enhancements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shorts">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Video className="w-5 h-5 text-pink-500" />
                Auto-Generated Shorts
              </h2>
              <div className="flex gap-2">
                <Button
                  onClick={handleRenderAll}
                  disabled={renderingIds.size > 0 || !sourceFileUrl || YT.shorts.length === 0}
                  title={!sourceFileUrl ? "Rendering needs an uploaded video file" : undefined}
                  className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white border-0"
                >
                  {renderingIds.size > 0 ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Render All
                </Button>
                <Button variant="outline" onClick={handleScheduleAll} disabled={YT.shorts.length === 0}>
                  Schedule All
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {YT.shorts.map((short) => (
                <ShortPreviewCard
                  key={short.id}
                  short={short}
                  renderedUrl={renderedUrls[short.id]}
                  isRendering={renderingIds.has(short.id)}
                  onPreview={() => {
                    const url = renderedUrls[short.id]
                      || (sourceFileUrl && short.start !== undefined ? `${sourceFileUrl}#t=${short.start}` : null);
                    if (url) window.open(url, "_blank");
                    else toast.error("Nothing to preview yet — render the short first");
                  }}
                  onRender={() => handleRenderShort(short)}
                  onSendToReel={() =>
                    navigate("/organic/reel-builder", {
                      state: { clip: short, sourceUrl: renderedUrls[short.id] || sourceFileUrl },
                    })
                  }
                  onSendToAd={() => navigate("/contentbox")}
                  onSchedule={async () => {
                    if (await handleScheduleShort(short)) {
                      toast.success(`"${short.title}" added to the scheduler`);
                    }
                  }}
                />
              ))}
            </div>
            {YT.shorts.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No shorts were found in this video.
              </p>
            )}
          </TabsContent>

          <TabsContent value="enhancements">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-pink-500" />
                Long-Form Enhancements
              </h2>
              {!YT.enhancementData && (
                <Button 
                  onClick={YT.generateEnhancements}
                  disabled={YT.isEnhancing || !YT.transcript}
                  className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white border-0"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {YT.isEnhancing ? "Analyzing..." : "Analyze for Enhancements"}
                </Button>
              )}
            </div>

            <LongFormEnhancementPanel 
              data={YT.enhancementData}
              isLoading={YT.isEnhancing}
              onApplyEnhancement={(type, item) => {
                console.log("Apply enhancement:", type, item);
                // TODO: Handle enhancement actions
              }}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* INTEGRATION BUTTONS */}
      {YT.isAnalyzed && (
        <Card className="border border-border bg-card animate-fade-in">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate("/organic/reel-builder")} variant="outline" className="hover:border-pink-500/50 hover:bg-pink-500/10">
                Send to Reel Builder
              </Button>

              <Button onClick={() => navigate("/contentbox")} variant="outline" className="hover:border-pink-500/50 hover:bg-pink-500/10">
                Send to Ad Creator
              </Button>

              <Button onClick={() => navigate("/organic/atomizer")} variant="outline" className="hover:border-pink-500/50 hover:bg-pink-500/10">
                Atomize Transcript
              </Button>

              <Button onClick={() => navigate("/content-schedule")} variant="outline" className="hover:border-pink-500/50 hover:bg-pink-500/10">
                Schedule Content
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon,
  highlight 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border flex flex-col items-center text-sm transition-all ${
      highlight 
        ? "border-pink-500/50 bg-pink-500/10" 
        : "border-border bg-muted/30"
    }`}>
      <div className={`mb-2 ${highlight ? "text-pink-500" : "text-primary"}`}>{icon}</div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-semibold text-lg ${highlight ? "text-pink-500" : ""}`}>{value}</p>
    </div>
  );
}
