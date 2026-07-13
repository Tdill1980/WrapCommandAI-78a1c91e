import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  Scissors,
  Sparkles,
  Play,
  Edit,
  Film,
  Clock,
  Zap,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadToDevice, generateFilename } from "@/lib/downloadUtils";

/** Read a video File's duration (seconds) from its metadata. 0 if unreadable. */
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

interface MicroReel {
  id: string;
  title: string;
  hook?: string;
  start: number;
  end: number;
  duration: number;
  hook_strength?: number;
  virality_score?: number;
  ad_potential?: boolean;
  overlay_suggestions?: string[];
  caption_suggestions?: string[];
  cta?: string;
  music_suggestion?: string;
  thumbnail_url?: string;
  render_status?: "pending" | "rendering" | "complete" | "failed";
  rendered_url?: string;
}

type ProcessingStep = "idle" | "uploading" | "transcribing" | "detecting_scenes" | "generating_shorts" | "complete" | "error";

export default function AutoSplit() {
  const navigate = useNavigate();
  const [sourceVideo, setSourceVideo] = useState<File | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [progress, setProgress] = useState(0);
  const [reels, setReels] = useState<MicroReel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [videoDuration, setVideoDuration] = useState<number>(0);
  // Cache the Mux asset for the source video so Render All doesn't re-upload
  // the same file once per reel (5 duplicate assets + minutes of waiting).
  const muxAssetRef = useRef<{ assetId: string; playbackId?: string } | null>(null);

  // Stable preview URL for the selected file (inline createObjectURL leaked a
  // new blob URL on every re-render during processing).
  const sourcePreviewUrl = useMemo(
    () => (sourceVideo ? URL.createObjectURL(sourceVideo) : null),
    [sourceVideo]
  );
  useEffect(() => {
    return () => {
      if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
    };
  }, [sourcePreviewUrl]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.type.startsWith("video/")) {
      setSourceVideo(file);
      setReels([]);
      setError(null);
    } else {
      toast.error("Please upload a video file");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".avi", ".webm", ".mkv"] },
    maxFiles: 1,
  });

  const handleProcess = async () => {
    if (!sourceVideo) return;

    try {
      setError(null);
      setProcessingStep("uploading");
      setProgress(10);

      // 1. Upload video to Supabase Storage
      const fileName = `auto-split/${Date.now()}-${sourceVideo.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("media-library")
        .upload(fileName, sourceVideo);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from("media-library")
        .getPublicUrl(fileName);
      
      const videoUrl = urlData.publicUrl;
      setSourceVideoUrl(videoUrl);
      muxAssetRef.current = null; // new source video → stale Mux asset
      setProgress(20);

      // Read the real duration so scene fallbacks / clip ranges never exceed it
      const duration = await getVideoDuration(sourceVideo);
      setVideoDuration(duration);
      setProgress(25);

      // 2. Transcribe the video — video-transcribe accepts { video_url } and
      // returns { transcript }. (transcribe-audio needs base64 audio; calling
      // it with a URL always failed silently, so every run had no transcript.)
      setProcessingStep("transcribing");
      const { data: transcriptData, error: transcriptError } = await lovableFunctions.functions.invoke(
        "video-transcribe",
        { body: { video_url: videoUrl, include_timestamps: false } }
      );

      if (transcriptError) {
        console.warn("Transcription failed, continuing without transcript:", transcriptError);
      }

      const transcript = transcriptData?.transcript || "";
      setProgress(45);

      // 3. Detect scenes
      setProcessingStep("detecting_scenes");
      const { data: sceneData, error: sceneError } = await lovableFunctions.functions.invoke(
        "yt-scene-detect",
        { body: { video_url: videoUrl, transcript, video_duration: duration || undefined } }
      );

      if (sceneError) {
        console.warn("Scene detection failed, using basic segmentation:", sceneError);
      }

      // AI-success path returns scenes under analysis.scenes; fallback returns
      // top-level scenes. Read both so real detections aren't discarded.
      const scenes = sceneData?.analysis?.scenes ?? sceneData?.scenes ?? [];
      setProgress(65);

      // 4. Generate shorts with AI
      setProcessingStep("generating_shorts");
      // Time-based fallback segments scaled to the REAL video length
      // (previously hardcoded 0–70s regardless of duration).
      const fallbackDur = duration > 0 ? duration : 50;
      const seg = fallbackDur / 5;
      const fallbackScenes = [
        "Opening segment", "Main content", "Middle segment", "Key moment", "Closing",
      ].map((description, i) => ({
        start: Math.round(i * seg * 10) / 10,
        end: Math.round(Math.min((i + 1) * seg, fallbackDur) * 10) / 10,
        description,
      }));

      const { data: shortsData, error: shortsError } = await lovableFunctions.functions.invoke(
        "yt-generate-shorts",
        {
          body: {
            job_id: `autosplit-${Date.now()}`,
            scenes: scenes.length > 0 ? scenes : fallbackScenes,
            transcript,
          },
        }
      );

      if (shortsError) throw new Error(`Shorts generation failed: ${shortsError.message}`);

      setProgress(90);

      // Clamp any AI-suggested range to the real video length
      const clampEnd = (v: number) => (duration > 0 ? Math.min(v, duration) : v);

      // Parse the shorts
      const generatedShorts: MicroReel[] = (shortsData?.shorts || [])
        .map((s: any, idx: number) => {
          const start = Math.max(0, Number(s.start) || idx * 10);
          const end = clampEnd(Number(s.end) || start + 10);
          return {
            id: s.id || `reel-${idx + 1}`,
            title: s.title || `Reel ${idx + 1}`,
            hook: s.hook,
            start,
            end,
            duration: Math.max(0, end - start),
            hook_strength: s.hook_strength,
            virality_score: s.virality_score,
            ad_potential: s.ad_potential,
            overlay_suggestions: s.overlay_suggestions,
            caption_suggestions: s.caption_suggestions,
            cta: s.cta,
            music_suggestion: s.music_suggestion,
            render_status: "pending" as const,
          };
        })
        .filter((r: MicroReel) => r.duration >= 2); // drop degenerate clips

      // If we got no usable shorts, fall back to even time segments — and say so
      if (generatedShorts.length === 0) {
        const fallbackReels: MicroReel[] = fallbackScenes.map((s, i) => ({
          id: String(i + 1),
          title: s.description,
          start: s.start,
          end: s.end,
          duration: Math.max(0, s.end - s.start),
          render_status: "pending" as const,
        }));
        setReels(fallbackReels);
        setProgress(100);
        setProcessingStep("complete");
        toast.warning("AI couldn't pick highlights — split into 5 even segments instead");
      } else {
        setReels(generatedShorts);
        setProgress(100);
        setProcessingStep("complete");
        toast.success(`Generated ${generatedShorts.length} micro-reels!`);
      }

    } catch (err) {
      console.error("AutoSplit error:", err);
      setError(err instanceof Error ? err.message : "Processing failed");
      setProcessingStep("error");
      toast.error("Failed to process video");
    }
  };

  const handleRenderReel = async (reel: MicroReel) => {
    if (!sourceVideoUrl) {
      toast.error("Source video not available");
      return;
    }

    try {
      setRenderingIds((prev) => new Set(prev).add(reel.id));

      // Update reel status
      setReels((prev) =>
        prev.map((r) => (r.id === reel.id ? { ...r, render_status: "rendering" } : r))
      );

      // Upload the source to Mux ONCE and reuse the asset for every clip
      // (previously each Render re-uploaded the full video: 5 reels = 5
      // duplicate Mux assets and minutes of redundant waiting).
      if (!muxAssetRef.current) {
        const { data: muxData, error: muxError } = await lovableFunctions.functions.invoke("mux-upload", {
          body: { file_url: sourceVideoUrl },
        });

        if (muxError) throw new Error(`Mux upload failed: ${muxError.message}`);
        if (!muxData?.asset_id) throw new Error("Failed to get Mux asset ID");

        muxAssetRef.current = {
          assetId: muxData.asset_id,
          playbackId: muxData.playback_id,
        };
      }

      // Create clip (mux-create-clip now waits for the asset to be ready)
      const { data: clipData, error: clipError } = await lovableFunctions.functions.invoke("mux-create-clip", {
        body: {
          asset_id: muxAssetRef.current.assetId,
          playback_id: muxAssetRef.current.playbackId,
          start_time: reel.start,
          end_time: reel.end,
          output_name: reel.title,
          create_permanent: true,
        },
      });

      if (clipError) throw new Error(`Clip creation failed: ${clipError.message}`);

      const renderedUrl = clipData?.download_url || clipData?.playback_url || clipData?.clip_url;
      if (!renderedUrl) throw new Error("Clip created but no URL returned");

      // Persist to the Media Library so the reel survives refresh/Start Over
      // (previously clips lived only in React state and were lost).
      const { error: cfError } = await contentDB.from("content_files").insert({
        file_url: renderedUrl,
        file_type: "video",
        source: "auto_split",
        original_filename: `${reel.title}.mp4`,
        thumbnail_url: clipData?.thumbnail_url || null,
        duration_seconds: Math.round(reel.duration),
        tags: ["auto-split", "micro-reel"],
        ai_labels: {
          hook: reel.hook,
          virality_score: reel.virality_score,
          source_video: sourceVideoUrl,
          start: reel.start,
          end: reel.end,
        },
      });
      if (cfError) console.error("Failed to save reel to media library:", cfError);

      // Update reel with rendered URL
      setReels((prev) =>
        prev.map((r) =>
          r.id === reel.id
            ? {
                ...r,
                render_status: "complete",
                rendered_url: renderedUrl,
                thumbnail_url: clipData?.thumbnail_url || r.thumbnail_url,
              }
            : r
        )
      );

      toast.success(`Rendered: ${reel.title}`);
    } catch (err) {
      console.error("Render error:", err);
      setReels((prev) =>
        prev.map((r) => (r.id === reel.id ? { ...r, render_status: "failed" } : r))
      );
      toast.error(`Failed to render: ${reel.title}`);
    } finally {
      setRenderingIds((prev) => {
        const next = new Set(prev);
        next.delete(reel.id);
        return next;
      });
    }
  };

  const handleRenderAll = async () => {
    for (const reel of reels) {
      if (reel.render_status !== "complete") {
        await handleRenderReel(reel);
      }
    }
  };

  const handlePreview = (reel: MicroReel) => {
    if (reel.rendered_url) {
      window.open(reel.rendered_url, "_blank");
    } else if (sourceVideoUrl) {
      // Open source video at timestamp
      window.open(`${sourceVideoUrl}#t=${reel.start}`, "_blank");
    }
  };

  const handleDownloadReel = (reel: MicroReel) => {
    if (reel.rendered_url) {
      // downloadToDevice saves the file; downloadFromUrl just opened a tab
      downloadToDevice(reel.rendered_url, generateFilename(`reel-${reel.id}`, "mp4"));
    } else {
      toast.error("Reel not rendered yet. Click 'Render' first.");
    }
  };

  const handleDownloadAll = () => {
    const completedReels = reels.filter(r => r.render_status === "complete" && r.rendered_url);
    if (completedReels.length === 0) {
      toast.error("No reels rendered yet. Click 'Render All' first.");
      return;
    }
    
    // Open each in new tab with slight delay to prevent popup blocking
    completedReels.forEach((reel, index) => {
      setTimeout(() => {
        if (reel.rendered_url) {
          window.open(reel.rendered_url, "_blank");
        }
      }, index * 500);
    });
    
    toast.success(`Opening ${completedReels.length} reels for download`);
  };

  const handleScheduleReel = async (reel: MicroReel) => {
    if (!reel.rendered_url) {
      toast.error("Reel not rendered yet");
      return;
    }

    try {
      // supabase-js returns errors instead of throwing — check it, or an RLS
      // denial still shows the success toast.
      const { error: insertError } = await contentDB.from("content_queue").insert({
        content_type: "reel",
        status: "draft",
        title: reel.title,
        caption: reel.hook || "",
        output_url: reel.rendered_url,
        brand: "wpw",
        channel: "organic",
        mode: "auto",
        ai_metadata: {
          source: "auto-split",
          virality_score: reel.virality_score,
          overlay_suggestions: reel.overlay_suggestions,
        },
      });
      if (insertError) throw insertError;
      toast.success(`"${reel.title}" added to scheduler!`);
    } catch (err) {
      console.error("Schedule error:", err);
      toast.error("Failed to add to scheduler");
    }
  };

  const getStepLabel = () => {
    switch (processingStep) {
      case "uploading":
        return "Uploading video...";
      case "transcribing":
        return "Transcribing audio...";
      case "detecting_scenes":
        return "Detecting scenes...";
      case "generating_shorts":
        return "AI generating micro-reels...";
      case "complete":
        return "Complete!";
      case "error":
        return "Error occurred";
      default:
        return "";
    }
  };

  const isProcessing = !["idle", "complete", "error"].includes(processingStep);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/organic")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg flex items-center gap-2">
                <Scissors className="w-5 h-5" />
                Auto-Split Engine
              </h1>
              <p className="text-xs text-muted-foreground">
                Turn 1 video into 5 viral micro-reels
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Upload Section */}
        {!sourceVideo && (
          <Card>
            <CardContent className="p-8">
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input {...getInputProps()} />
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold text-lg mb-2">Upload Source Video</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {isDragActive
                    ? "Drop the video here..."
                    : "Drag & drop your long-form video here, or click to browse. AI will analyze and split it into 5 optimized micro-reels."}
                </p>
                <Button className="mt-6" variant="outline">
                  Select Video
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Source Video Selected - Processing */}
        {sourceVideo && reels.length === 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-32 aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                  {sourcePreviewUrl && (
                    <video
                      src={sourcePreviewUrl}
                      className="w-full h-full object-cover"
                      muted
                    />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{sourceVideo.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {isProcessing ? getStepLabel() : "Ready to process"}
                  </p>
                </div>
                <Button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Scissors className="w-4 h-4 mr-2" />
                      Generate Micro-Reels
                    </>
                  )}
                </Button>
              </div>

              {isProcessing && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{getStepLabel()}</span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Generated Reels */}
        {reels.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Your {reels.length} Reels Are Ready 🎉
              </h2>
              <Button
                variant="outline"
                onClick={() => {
                  setReels([]);
                  setSourceVideo(null);
                  setSourceVideoUrl(null);
                  setProcessingStep("idle");
                  setProgress(0);
                  setVideoDuration(0);
                  muxAssetRef.current = null;
                }}
              >
                Start Over
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reels.map((reel, index) => (
                <Card key={reel.id} className="overflow-hidden group">
                  <div className="aspect-[9/16] bg-muted relative">
                    {sourceVideoUrl ? (
                      <video
                        src={sourceVideoUrl}
                        className="w-full h-full object-cover"
                        muted
                        onLoadedMetadata={(e) => {
                          (e.target as HTMLVideoElement).currentTime = reel.start;
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Film className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <Badge className="absolute top-2 left-2 bg-black/70">
                      Reel {index + 1}
                    </Badge>
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-white bg-black/70 px-2 py-1 rounded">
                      <Clock className="w-3 h-3" />
                      {reel.duration.toFixed(1)}s
                    </div>

                    {/* Render Status */}
                    {reel.render_status === "complete" && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      </div>
                    )}

                    {/* Virality Score */}
                    {reel.virality_score && (
                      <div className="absolute bottom-2 left-2 text-xs text-white bg-gradient-to-r from-[#405DE6] to-[#E1306C] px-2 py-1 rounded">
                        🔥 {reel.virality_score}%
                      </div>
                    )}

                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="icon" variant="secondary" onClick={() => handlePreview(reel)}>
                        <Play className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-medium text-sm">{reel.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {reel.start.toFixed(1)}s – {reel.end.toFixed(1)}s
                    </p>
                    {reel.hook && (
                      <p className="text-xs text-primary mt-1 truncate">"{reel.hook}"</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => navigate("/organic/reel-builder", { state: { clip: reel, sourceUrl: sourceVideoUrl } })}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handlePreview(reel)}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
                        disabled={renderingIds.has(reel.id) || reel.render_status === "complete"}
                        onClick={() => handleRenderReel(reel)}
                      >
                        {renderingIds.has(reel.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : reel.render_status === "complete" ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          "Render"
                        )}
                      </Button>
                    </div>
                    
                    {/* Download & Schedule row - only show when rendered */}
                    {reel.render_status === "complete" && reel.rendered_url && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleDownloadReel(reel)}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleScheduleReel(reel)}
                        >
                          <Calendar className="w-3 h-3 mr-1" />
                          Schedule
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Bulk Actions */}
            <Card className="border-primary/30">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold">Bulk Actions</h3>
                  <p className="text-sm text-muted-foreground">
                    Export all {reels.length} micro-reels at once
                  </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    onClick={handleDownloadAll}
                    disabled={!reels.some(r => r.render_status === "complete")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </Button>
                  <Button
                    className="bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
                    onClick={handleRenderAll}
                    disabled={renderingIds.size > 0}
                  >
                    {renderingIds.size > 0 ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Rendering...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Render All ({reels.length})
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
