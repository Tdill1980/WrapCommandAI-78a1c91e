import { useState, useCallback, useRef, useEffect } from "react";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createCreativeWithTags, saveBlueprintSnapshot, updateCreative, type Creative, type FormatSlug } from "@/lib/creativeVault";
import { validateAndNormalizeBlueprint, type SceneBlueprintV1 } from "@/lib/blueprints";

export interface VideoEditItem {
  id: string;
  organization_id: string | null;
  content_file_id: string | null;
  source_url: string;
  title: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  ai_edit_suggestions: any;
  selected_music_id: string | null;
  selected_music_url: string | null;
  text_overlays: any[];
  speed_ramps: any[];
  chapters: any[];
  shorts_extracted: any[];
  final_render_url: string | null;
  render_status: string;
  status: string;
  created_at: string;
  updated_at: string;
  // New fields for debugging
  error_message: string | null;
  debug_payload: any;
  producer_locked: boolean;
  producer_blueprint: any;
}

export interface MusicTrack {
  id: string;
  title: string;
  file_url: string;
  duration_seconds: number | null;
  bpm: number | null;
  energy: string;
  mood: string;
  genre: string | null;
  match_score?: number;
}

export interface RenderProgress {
  videoEditId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  progress: number;
  message: string;
  outputUrl?: string;
  error?: string;
}

export function useMightyEdit() {
  const [isScanning, setIsScanning] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [editQueue, setEditQueue] = useState<VideoEditItem[]>([]);
  const [musicRecommendations, setMusicRecommendations] = useState<MusicTrack[]>([]);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [lastCreativeId, setLastCreativeId] = useState<string | null>(null);
  
  // Polling refs
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const MAX_POLL_COUNT = 60; // Stop polling after 5 minutes (60 * 5s)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const fetchEditQueue = useCallback(async () => {
    const { data, error } = await contentDB
      .from("video_edit_queue")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[useMightyEdit] Failed to fetch edit queue:", error);
      return;
    }

    setEditQueue(data as VideoEditItem[]);
  }, []);

  const scanContentLibrary = useCallback(async (options?: { 
    contentFileId?: string; 
    scanAll?: boolean 
  }) => {
    setIsScanning(true);
    console.log("[useMightyEdit] Scanning content library:", options);
    
    try {
      const { data, error } = await lovableFunctions.functions.invoke("ai-scan-content-library", {
        body: {
          content_file_id: options?.contentFileId,
          scan_all: options?.scanAll
        }
      });

      if (error) {
        console.error("[useMightyEdit] Scan error:", error);
        throw error;
      }

      console.log("[useMightyEdit] Scan result:", data);
      toast.success(`Scanned ${data.scanned} videos for AI editing`);
      await fetchEditQueue();
      return data;
    } catch (err) {
      console.error("[useMightyEdit] Scan failed:", err);
      toast.error("Failed to scan content library");
      throw err;
    } finally {
      setIsScanning(false);
    }
  }, [fetchEditQueue]);

  /**
   * Generate a scene blueprint for a video - calls AI or creates fallback
   */
  const generateBlueprint = useCallback(async (video: VideoEditItem): Promise<any> => {
    console.log("[useMightyEdit] Generating blueprint for video:", video.id);
    
    // If video already has a producer_blueprint, use it
    if (video.producer_blueprint?.scenes?.length > 0) {
      console.log("[useMightyEdit] Using existing producer_blueprint");
      return video.producer_blueprint;
    }
    
    // If video has ai_edit_suggestions with scenes, use those
    if (video.ai_edit_suggestions?.scenes?.length > 0) {
      console.log("[useMightyEdit] Using existing ai_edit_suggestions");
      return video.ai_edit_suggestions;
    }
    
    // Try to call AI blueprint generator
    try {
      const { data, error } = await lovableFunctions.functions.invoke("ai-generate-video-blueprint", {
        body: {
          video_url: video.source_url,
          duration_seconds: video.duration_seconds,
          transcript: video.transcript,
          text_overlays: video.text_overlays,
          platform: 'instagram',
          goal: 'engagement',
        }
      });
      
      if (!error && data?.blueprint) {
        console.log("[useMightyEdit] AI generated blueprint:", data.blueprint);
        return data.blueprint;
      }
      
      console.warn("[useMightyEdit] AI blueprint generation failed, using fallback:", error);
    } catch (err) {
      console.warn("[useMightyEdit] AI blueprint call failed, using fallback:", err);
    }
    
    // Fallback: Create a simple single-scene blueprint from the source video
    const duration = video.duration_seconds || 30;
    const fallbackBlueprint = {
      blueprint_id: `bp_fallback_${video.id}`,
      blueprint_source: 'mightyedit_fallback',
      format: 'reel',
      aspect_ratio: '9:16',
      template_id: 'ig_reel_v1',
      overlay_pack: 'wpw_signature',
      font: 'Inter Black',
      text_style: 'bold',
      scenes: [{
        scene_id: 'scene_1',
        clip_id: 'clip_1',
        start_time: 0,
        end_time: Math.min(duration, 60), // Max 60 seconds
        clip_url: video.source_url,
        purpose: 'content',
        text_overlay: video.text_overlays?.[0]?.text || null,
        text_position: 'center',
        animation: 'pop',
      }]
    };
    
    console.log("[useMightyEdit] Created fallback blueprint:", fallbackBlueprint);
    return fallbackBlueprint;
  }, []);

  /**
   * Create an ai_creatives record and link it to the video edit queue
   * Blueprint MUST be pre-validated via validateAndNormalizeBlueprint
   */
  const createCreativeRecord = useCallback(async (
    video: VideoEditItem, 
    blueprint: SceneBlueprintV1,
    queueId: string
  ): Promise<Creative | null> => {
    console.log("[useMightyEdit] Creating ai_creatives record...");
    
    try {
      // Ensure blueprint is normalized (should already be, but belt + suspenders)
      let normalizedBlueprint: SceneBlueprintV1;
      try {
        normalizedBlueprint = validateAndNormalizeBlueprint(blueprint);
      } catch (e) {
        console.error("[useMightyEdit] Blueprint validation failed in createCreativeRecord:", e);
        // Use as-is if already validated (type assertion)
        normalizedBlueprint = blueprint;
      }
      
      // Map format to valid FormatSlug
      const formatSlug: FormatSlug = 
        normalizedBlueprint.format === 'story' ? 'story' : 
        normalizedBlueprint.format === 'short' ? 'short' : 'reel';
      
      // Create the creative record
      const creative = await createCreativeWithTags({
        title: video.title || 'MightyEdit Render',
        description: 'Generated via MightyEdit',
        sourceType: 'manual',
        toolSlug: 'mighty_edit',
        formatSlug,
        platform: normalizedBlueprint.platform || 'instagram',
        createdBy: 'user',
      });
      
      console.log("[useMightyEdit] Created creative:", creative.id);
      
      // Save the normalized blueprint to the creative
      await saveBlueprintSnapshot(creative.id, normalizedBlueprint);
      console.log("[useMightyEdit] Saved blueprint to creative");
      
      // Update the creative to rendering status
      await updateCreative(creative.id, {
        status: 'rendering',
        latest_render_job_id: queueId,
      });
      
      // Link the creative to the video_edit_queue
      const { error: linkError } = await contentDB
        .from('video_edit_queue')
        .update({ 
          ai_creative_id: creative.id,
          ai_edit_suggestions: normalizedBlueprint, // Normalized blueprint for render-reel
        })
        .eq('id', queueId);
      
      if (linkError) {
        console.error("[useMightyEdit] Failed to link creative to queue:", linkError);
      } else {
        console.log("[useMightyEdit] Linked creative to video_edit_queue");
      }
      
      setLastCreativeId(creative.id);
      return creative;
    } catch (err) {
      console.error("[useMightyEdit] Failed to create creative record:", err);
      return null;
    }
  }, []);

  const matchMusic = useCallback(async (videoEditId: string, transcript?: string, durationSeconds?: number) => {
    setIsMatching(true);
    console.log("[useMightyEdit] Matching music for:", videoEditId);
    
    try {
      const { data, error } = await lovableFunctions.functions.invoke("ai-match-music", {
        body: {
          video_edit_id: videoEditId,
          transcript,
          duration_seconds: durationSeconds
        }
      });

      if (error) {
        console.error("[useMightyEdit] Music match error:", error);
        throw error;
      }

      console.log("[useMightyEdit] Music match result:", data);
      setMusicRecommendations(data.recommendations || []);
      toast.success(`Found ${data.recommendations?.length || 0} music matches`);
      await fetchEditQueue();
      return data;
    } catch (err) {
      console.error("[useMightyEdit] Music matching failed:", err);
      toast.error("Failed to match music");
      throw err;
    } finally {
      setIsMatching(false);
    }
  }, [fetchEditQueue]);

  // Poll for render status updates
  const startPollingRenderStatus = useCallback((videoEditId: string) => {
    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    pollCountRef.current = 0;

    console.log("[useMightyEdit] Starting render status polling for:", videoEditId);

    setRenderProgress({
      videoEditId,
      status: 'processing',
      progress: 10,
      message: 'Render started, processing...'
    });

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current++;
      
      if (pollCountRef.current > MAX_POLL_COUNT) {
        console.log("[useMightyEdit] Max poll count reached, stopping");
        clearInterval(pollIntervalRef.current!);
        setRenderProgress(prev => prev ? {
          ...prev,
          status: 'failed',
          message: 'Render timed out - check Render Queue for status'
        } : null);
        return;
      }

      try {
        const { data, error } = await contentDB
          .from("video_edit_queue")
          .select("render_status, status, final_render_url, shorts_extracted, error_message, debug_payload")
          .eq("id", videoEditId)
          .single();

        if (error) {
          console.error("[useMightyEdit] Poll error:", error);
          return;
        }

        console.log("[useMightyEdit] Poll result:", data);

        // Update progress based on status
        if (data.render_status === 'complete' || data.status === 'complete') {
          clearInterval(pollIntervalRef.current!);
          setRenderProgress({
            videoEditId,
            status: 'complete',
            progress: 100,
            message: 'Render complete!',
            outputUrl: data.final_render_url || undefined
          });
          toast.success("Video rendered successfully!", {
            description: "Check the Render Queue tab to download",
            action: data.final_render_url ? {
              label: "Open",
              onClick: () => window.open(data.final_render_url, "_blank")
            } : undefined
          });
          await fetchEditQueue();
          return;
        }

        if (data.render_status === 'failed' || data.status === 'error') {
          clearInterval(pollIntervalRef.current!);
          const errorMsg = data.error_message || 'Check logs for details';
          setRenderProgress({
            videoEditId,
            status: 'failed',
            progress: 0,
            message: 'Render failed',
            error: errorMsg
          });
          toast.error("Render failed", {
            description: errorMsg.length > 100 ? errorMsg.substring(0, 100) + '...' : errorMsg
          });
          return;
        }

        // Still processing - update progress
        const progress = Math.min(10 + pollCountRef.current * 1.5, 90);
        setRenderProgress({
          videoEditId,
          status: 'processing',
          progress,
          message: data.render_status === 'processing' 
            ? 'Processing video with Mux...' 
            : 'Preparing render...'
        });
      } catch (err) {
        console.error("[useMightyEdit] Poll exception:", err);
      }
    }, 5000); // Poll every 5 seconds
  }, [fetchEditQueue]);

  const executeEdits = useCallback(async (videoEditId: string, renderType: "full" | "shorts" | "all" = "full") => {
    console.log("[useMightyEdit] executeEdits INVOKED", { videoEditId, renderType });
    setIsExecuting(true);
    console.log("[useMightyEdit] ====== EXECUTE EDITS START ======");
    console.log("[useMightyEdit] Video Edit ID:", videoEditId);
    console.log("[useMightyEdit] Render Type:", renderType);
    
    try {
      // Show initial toast
      toast.loading("Starting render...", { id: `render-${videoEditId}` });
      
      console.log("[useMightyEdit] Invoking ai-execute-edits edge function...");
      
      const { data, error } = await lovableFunctions.functions.invoke("ai-execute-edits", {
        body: {
          video_edit_id: videoEditId,
          render_type: renderType
        }
      });

      console.log("[useMightyEdit] Edge function response:", { data, error });

      if (error) {
        console.error("[useMightyEdit] Edge function error:", error);
        toast.error("Render failed", { 
          id: `render-${videoEditId}`,
          description: error.message || "Check console for details"
        });
        throw error;
      }

      // Check for error in data
      if (data?.error) {
        console.error("[useMightyEdit] Render error in response:", data.error);
        toast.error("Render failed", { 
          id: `render-${videoEditId}`,
          description: data.error
        });
        throw new Error(data.error);
      }

      console.log("[useMightyEdit] Render started successfully:", data);
      
      toast.success("Rendering started!", { 
        id: `render-${videoEditId}`,
        description: "We'll notify you when it's ready"
      });
      
      // Start polling for status updates
      startPollingRenderStatus(videoEditId);
      
      await fetchEditQueue();
      return data;
    } catch (err) {
      console.error("[useMightyEdit] Execute edits failed:", err);
      setRenderProgress({
        videoEditId,
        status: 'failed',
        progress: 0,
        message: 'Failed to start render',
        error: err instanceof Error ? err.message : 'Unknown error'
      });
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [fetchEditQueue, startPollingRenderStatus]);

  const updateEditItem = useCallback(async (id: string, updates: Partial<VideoEditItem>) => {
    console.log("[useMightyEdit] Updating edit item:", id, updates);
    
    const { error } = await contentDB
      .from("video_edit_queue")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("[useMightyEdit] Update failed:", error);
      toast.error("Failed to update edit item");
      throw error;
    }

    await fetchEditQueue();
  }, [fetchEditQueue]);

  const selectMusic = useCallback(async (videoEditId: string, musicId: string, musicUrl: string) => {
    await updateEditItem(videoEditId, {
      selected_music_id: musicId,
      selected_music_url: musicUrl
    });
    toast.success("Music selected");
  }, [updateEditItem]);

  // Mark a linked task as complete after successful render
  const markTaskComplete = useCallback(async (taskId: string) => {
    try {
      console.log("[useMightyEdit] Marking task complete:", taskId);
      
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed" })
        .eq("id", taskId);

      if (error) {
        console.error("[useMightyEdit] Failed to mark task complete:", error);
        return false;
      }

      toast.success("Task marked as complete!");
      return true;
    } catch (err) {
      console.error("[useMightyEdit] Error marking task complete:", err);
      return false;
    }
  }, []);

  // Stop polling (can be called manually)
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setRenderProgress(null);
  }, []);

  return {
    isScanning,
    isMatching,
    isExecuting,
    editQueue,
    musicRecommendations,
    renderProgress,
    lastCreativeId,
    fetchEditQueue,
    scanContentLibrary,
    matchMusic,
    executeEdits,
    updateEditItem,
    selectMusic,
    markTaskComplete,
    stopPolling,
    generateBlueprint,
    createCreativeRecord,
  };
}
