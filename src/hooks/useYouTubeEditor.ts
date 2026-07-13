import { useState, useCallback, useEffect, useRef } from "react";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Scene {
  id: number;
  type: "hook" | "value" | "reveal" | "cta" | "testimonial" | "filler";
  start: string;
  end: string;
  score: number;
  text?: string;
  energy_level?: "low" | "medium" | "high";
}

export interface GeneratedShort {
  id: string;
  title: string;
  duration: string;
  hookStrength: "Weak" | "Medium" | "Strong";
  start?: number;
  end?: number;
  hook?: string;
  virality_score?: number;
  ad_potential?: boolean;
  overlay_suggestions?: string[];
  caption_suggestions?: string[];
  cta?: string;
  music_suggestion?: string;
}

export interface AnalysisData {
  duration: string;
  scenes: number;
  spikes: number;
  shorts: number;
  hookScore: number;
  productMentions: number;
  chapters?: { time: string; title: string }[];
}

export interface EnhancementData {
  pacing?: {
    overall_score: number;
    slow_sections: Array<{ start: string; end: string; suggestion: string }>;
    rushed_sections: Array<{ start: string; end: string; suggestion: string }>;
  };
  filler_words?: {
    total_count: number;
    density_per_minute: number;
    instances: Array<{ word: string; timestamp: string }>;
  };
  dead_air?: {
    total_seconds: number;
    instances: Array<{ start: string; duration: number; suggestion: string }>;
  };
  emotional_beats?: {
    arc_type: string;
    high_points: Array<{ timestamp: string; description: string; energy: number }>;
    low_points: Array<{ timestamp: string; description: string }>;
  };
  broll_cues?: Array<{ timestamp: string; duration: number; suggestion: string; type: string }>;
  text_overlays?: Array<{ timestamp: string; text: string; style: string }>;
  chapters?: Array<{ time: string; title: string }>;
  quality_scores?: {
    pacing: number;
    engagement: number;
    clarity: number;
    production_notes: string[];
  };
}

export type ProcessingStatus = 
  | "idle" 
  | "uploading" 
  | "transcribing" 
  | "analyzing" 
  | "generating_shorts" 
  | "enhancing"
  | "complete" 
  | "failed";

export function useYouTubeEditor() {
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [selectedShort, setSelectedShort] = useState<GeneratedShort | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [enhancementData, setEnhancementData] = useState<EnhancementData | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Real analysis results — start EMPTY. (This used to ship hardcoded demo
  // stats + Math.random() placeholder shorts that rendered as if real.)
  const [analysis, setAnalysis] = useState<AnalysisData>({
    duration: "0:00",
    scenes: 0,
    spikes: 0,
    shorts: 0,
    hookScore: 0,
    productMentions: 0,
  });

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shorts, setShorts] = useState<GeneratedShort[]>([]);

  // Poll bookkeeping — cleared on unmount/reset so navigating away doesn't
  // leak an interval, and capped so a stuck job can't poll forever.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  // Poll for job status
  const pollJobStatus = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("youtube_editor_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Failed to poll job status:", error);
      return null;
    }

    return data;
  }, []);

  // Upload/URL → real analysis pipeline (yt-analyze drives transcribe →
  // scene-detect → shorts server-side; we poll the job row).
  const uploadAndAnalyze = useCallback(async (fileUrl: string, organizationId?: string, videoDuration?: number) => {
    if (!organizationId) {
      toast.error("No organization found — job status is org-scoped");
      return;
    }
    setIsAnalyzing(true);
    setProcessingStatus("uploading");

    try {
      const { data, error } = await lovableFunctions.functions.invoke("yt-analyze", {
        body: { file_url: fileUrl, organization_id: organizationId, video_duration: videoDuration }
      });

      if (error) throw error;

      setJobId(data.job_id);
      setProcessingStatus("transcribing");
      toast.success("Processing started — analyzing your video…");

      // Start polling for status (max ~10 min, then give up loudly)
      stopPolling();
      const MAX_POLLS = 200;
      let polls = 0;
      pollRef.current = setInterval(async () => {
        polls += 1;
        if (polls > MAX_POLLS) {
          stopPolling();
          setIsAnalyzing(false);
          setProcessingStatus("failed");
          toast.error("Analysis is taking too long — please try again");
          return;
        }
        const job = await pollJobStatus(data.job_id);
        if (job) {
          setProcessingStatus(job.processing_status as ProcessingStatus);

          if (job.processing_status === "complete") {
            stopPolling();
            setIsAnalyzing(false);
            setIsAnalyzed(true);
            
            // Update UI with real data
            const analysisData = job.analysis_data as Record<string, unknown> | null;
            const generatedShorts = job.generated_shorts as unknown[] | null;
            
            if (analysisData && typeof analysisData === 'object') {
              setAnalysis({
                duration: String(analysisData.duration_estimate || "0:00"),
                scenes: Array.isArray(analysisData.scenes) ? analysisData.scenes.length : 0,
                spikes: Number(analysisData.energy_spikes) || 0,
                shorts: Array.isArray(generatedShorts) ? generatedShorts.length : 0,
                hookScore: Number(analysisData.hook_score) || 0,
                productMentions: Number(analysisData.product_mentions) || 0,
                chapters: analysisData.chapters as { time: string; title: string }[] | undefined,
              });
              if (Array.isArray(analysisData.scenes)) {
                setScenes(analysisData.scenes as Scene[]);
              }
            }

            if (Array.isArray(generatedShorts)) {
              setShorts(generatedShorts.map((s: unknown, idx: number) => {
                const short = s as Record<string, unknown>;
                const dur = Number(short.duration);
                return {
                  id: String(short.id || `short_${idx + 1}`),
                  title: String(short.title || `Short ${idx + 1}`),
                  duration: Number.isFinite(dur) ? `${dur.toFixed(1)}s` : "—",
                  hookStrength: Number(short.hook_strength) > 80 ? "Strong" : Number(short.hook_strength) > 50 ? "Medium" : "Weak",
                  start: Number(short.start) || undefined,
                  end: Number(short.end) || undefined,
                  hook: String(short.hook || ''),
                  virality_score: Number(short.virality_score) || undefined,
                  ad_potential: Boolean(short.ad_potential),
                  overlay_suggestions: short.overlay_suggestions as string[] | undefined,
                  caption_suggestions: short.caption_suggestions as string[] | undefined,
                  cta: String(short.cta || ''),
                  music_suggestion: String(short.music_suggestion || ''),
                };
              }));
            }
            
            if (job.transcript) {
              setTranscript(job.transcript);
            }
            
            toast.success("Analysis complete!");
          } else if (job.processing_status === "failed") {
            stopPolling();
            setIsAnalyzing(false);
            setProcessingStatus("failed");
            toast.error("Analysis failed");
          }
        }
      }, 3000);

    } catch (err) {
      console.error("Upload failed:", err);
      setIsAnalyzing(false);
      setProcessingStatus("failed");
      toast.error("Failed to start analysis");
    }
  }, [pollJobStatus, stopPolling]);

  // Generate long-form enhancements
  const generateEnhancements = useCallback(async () => {
    if (!jobId || !transcript) {
      toast.error("No transcript available for enhancement analysis");
      return;
    }

    setIsEnhancing(true);
    setProcessingStatus("enhancing");

    try {
      const { data, error } = await lovableFunctions.functions.invoke("yt-enhance-longform", {
        body: { job_id: jobId, transcript }
      });

      if (error) throw error;

      if (data.enhancements) {
        setEnhancementData(data.enhancements);
        toast.success("Enhancement analysis complete!");
      }
    } catch (err) {
      console.error("Enhancement failed:", err);
      toast.error("Failed to generate enhancements");
    } finally {
      setIsEnhancing(false);
      setProcessingStatus("complete");
    }
  }, [jobId, transcript]);

  const reset = useCallback(() => {
    stopPolling();
    setVideoUrl("");
    setUploadedFile(null);
    setIsAnalyzing(false);
    setIsAnalyzed(false);
    setSelectedScene(null);
    setSelectedShort(null);
    setJobId(null);
    setProcessingStatus("idle");
    setTranscript(null);
    setEnhancementData(null);
    setIsEnhancing(false);
    setScenes([]);
    setShorts([]);
    setAnalysis({ duration: "0:00", scenes: 0, spikes: 0, shorts: 0, hookScore: 0, productMentions: 0 });
  }, [stopPolling]);

  return {
    videoUrl,
    setVideoUrl,
    uploadedFile,
    setUploadedFile,
    isAnalyzing,
    isAnalyzed,
    uploadAndAnalyze,
    reset,
    analysis,
    scenes,
    shorts,
    selectedScene,
    setSelectedScene,
    selectedShort,
    setSelectedShort,
    jobId,
    processingStatus,
    transcript,
    enhancementData,
    isEnhancing,
    generateEnhancements,
  };
}
