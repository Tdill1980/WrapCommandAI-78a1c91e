// src/hooks/useMetaVideoAdGenerator.ts

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { MetaPlacement } from "@/lib/meta-ads";

export interface VideoAnalysis {
  concept: string;
  hook_recommendation: string;
  key_moments: Array<{ timestamp: number; description: string }>;
  thumbnail_recommendation: string;
}

export interface AdCopy {
  short_texts: string[];
  long_texts: string[];
  headlines: string[];
  descriptions: string[];
  cta: string;
  angles: Array<{
    name: string;
    primary_text: string;
    headline: string;
  }>;
}

export interface VideoAdOverlay {
  text: string;
  timing_start: number;
  timing_end: number;
  position: string;
}

export interface VideoAdTimeline {
  hook_text: string;
  cta_text: string;
  brand_colors: string[];
}

export interface VideoAdOutput {
  video_analysis: VideoAnalysis;
  ad_copy: AdCopy;
  overlays: VideoAdOverlay[];
  timeline: VideoAdTimeline;
  render_id?: string;
}

export type StyleModifier = "none" | "garyvee" | "sabrisuby" | "daradenney";

export const VIDEO_AD_BUTTON_LABELS = [
  "Generate Video Ad (Fast Mode)",
  "Create Meta Ad (Instant)",
  "Auto-Build Ad",
  "Make This an Ad",
  "Build High-Converting Ad",
] as const;

export type VideoAdButtonLabel = (typeof VIDEO_AD_BUTTON_LABELS)[number];

export function useMetaVideoAdGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [output, setOutput] = useState<VideoAdOutput | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateVideoAd = useCallback(
    async ({
      videoUrl,
      placement,
      organizationId,
      styleModifier = "none",
      autoRender = false,
    }: {
      videoUrl: string;
      placement: MetaPlacement;
      organizationId?: string;
      styleModifier?: StyleModifier;
      autoRender?: boolean;
    }) => {
      setIsGenerating(true);
      setError(null);
      setOutput(null);
      setRenderedUrl(null);

      try {
        const { data, error: fnError } = await lovableFunctions.functions.invoke(
          "ai-generate-video-ad",
          {
            body: {
              video_url: videoUrl,
              placement,
              organization_id: organizationId,
              style_modifier: styleModifier,
              auto_render: autoRender,
            },
          }
        );

        if (fnError) throw fnError;
        if (!data?.success) throw new Error(data?.error || "Generation failed");

        const result: VideoAdOutput = {
          video_analysis: data.video_analysis,
          ad_copy: data.ad_copy,
          overlays: data.overlays,
          timeline: data.timeline,
          render_id: data.render_id,
        };

        setOutput(result);
        toast.success("Video ad generated!");

        // If auto-render was requested and we got a render_id, start polling
        if (autoRender && data.render_id) {
          pollRenderStatus(data.render_id);
        }

        return result;
      } catch (e: any) {
        console.error("Video ad generation error:", e);
        setError(e.message);
        toast.error("Failed to generate video ad");
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const startRender = useCallback(
    async (videoUrl: string, headline: string, ctaText: string, organizationId?: string) => {
      setIsRendering(true);
      setRenderProgress(0);
      setError(null);

      try {
        const { data, error: fnError } = await lovableFunctions.functions.invoke(
          "render-video-reel",
          {
            body: {
              action: "start",
              video_url: videoUrl,
              headline,
              subtext: ctaText,
              organization_id: organizationId,
            },
          }
        );

        if (fnError) throw fnError;
        if (!data?.render_id) throw new Error("No render ID returned");

        toast.info("Rendering started...");
        pollRenderStatus(data.render_id);
        return data.render_id;
      } catch (e: any) {
        console.error("Render start error:", e);
        setError(e.message);
        setIsRendering(false);
        toast.error("Failed to start render");
        return null;
      }
    },
    []
  );

  const pollRenderStatus = useCallback(async (renderId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        setIsRendering(false);
        setError("Render timed out");
        toast.error("Render timed out");
        return;
      }

      try {
        const { data } = await lovableFunctions.functions.invoke("render-video-reel", {
          body: { action: "status", render_id: renderId },
        });

        if (data?.status === "succeeded" && data?.url) {
          setRenderedUrl(data.url);
          setRenderProgress(100);
          setIsRendering(false);
          toast.success("Video ad rendered!");
          return;
        }

        if (data?.status === "failed") {
          setIsRendering(false);
          setError("Render failed");
          toast.error("Render failed");
          return;
        }

        // Update progress based on status
        if (data?.progress) {
          setRenderProgress(data.progress);
        } else {
          setRenderProgress(Math.min(90, attempts * 3));
        }

        // Continue polling
        setTimeout(poll, 3000);
      } catch (e) {
        console.error("Poll error:", e);
        setTimeout(poll, 3000);
      }
    };

    poll();
  }, []);

  const saveToVault = useCallback(
    async (pngUrl: string, placement: string, headline: string, cta: string, organizationId: string) => {
      try {
        const { error: insertError } = await supabase.from("ad_vault").insert({
          organization_id: organizationId,
          placement,
          type: "video",
          png_url: pngUrl,
          headline,
          cta,
        });

        if (insertError) throw insertError;
        toast.success("Saved to Ad Vault!");
        return true;
      } catch (e: any) {
        console.error("Save to vault error:", e);
        toast.error("Failed to save to vault");
        return false;
      }
    },
    []
  );

  const addToScheduler = useCallback(
    async (
      output: VideoAdOutput,
      videoUrl: string,
      organizationId?: string
    ) => {
      try {
        const insertData: Record<string, unknown> = {
          title: output.ad_copy.headlines[0] || "Video Ad",
          content_type: "video_ad",
          mode: "fast",
          status: "draft",
          media_urls: [videoUrl],
          caption: output.ad_copy.short_texts[0],
          cta_text: output.ad_copy.cta,
          ai_metadata: {
            video_analysis: output.video_analysis,
            overlays: output.overlays,
            timeline: output.timeline,
            angles: output.ad_copy.angles,
          },
        };
        
        if (organizationId) {
          insertData.organization_id = organizationId;
        }

        const { error: insertError } = await contentDB.from("content_queue").insert(insertData);

        if (insertError) throw insertError;
        toast.success("Added to Content Scheduler!");
        return true;
      } catch (e: any) {
        console.error("Add to scheduler error:", e);
        toast.error("Failed to add to scheduler");
        return false;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setOutput(null);
    setRenderedUrl(null);
    setError(null);
    setIsGenerating(false);
    setIsRendering(false);
    setRenderProgress(0);
  }, []);

  return {
    generateVideoAd,
    startRender,
    saveToVault,
    addToScheduler,
    reset,
    isGenerating,
    isRendering,
    renderProgress,
    output,
    renderedUrl,
    error,
  };
}
