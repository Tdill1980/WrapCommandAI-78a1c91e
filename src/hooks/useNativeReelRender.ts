import { useState, useCallback } from "react";
import { lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { SceneBlueprint } from "@/types/SceneBlueprint";
import { toast } from "sonner";

/**
 * useNativeReelRender
 *
 * Renders a SceneBlueprint on the SELF-HOSTED ffmpeg pipeline — the same path
 * the Reel Builder uses (render-reel-ffmpeg → reel_render_jobs → the ffmpeg
 * worker). There is NO Creatomate involved.
 *
 * Flow: create a content_files + video_edit_queue row → call render-reel-ffmpeg
 * with the blueprint → the call either returns final_url synchronously (short
 * renders) or status:"processing", in which case we poll
 * video_edit_queue.final_render_url until the worker finishes.
 */

export type NativeRenderStatus = "idle" | "queued" | "rendering" | "complete" | "failed";

interface RenderOptions {
  musicUrl?: string | null;
  captions?: unknown[];
  title?: string;
  creativeId?: string | null;
}

export function useNativeReelRender() {
  const [status, setStatus] = useState<NativeRenderStatus>("idle");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRendering = status === "queued" || status === "rendering";

  const reset = useCallback(() => {
    setStatus("idle");
    setOutputUrl(null);
    setError(null);
  }, []);

  const render = useCallback(
    async (blueprint: SceneBlueprint, opts: RenderOptions = {}): Promise<string | null> => {
      if (!blueprint?.scenes?.length) {
        toast.error("Nothing to render — blueprint has no scenes");
        return null;
      }
      const primaryClipUrl = blueprint.scenes[0]?.clipUrl;
      if (!primaryClipUrl) {
        toast.error("Blueprint scene missing a clip URL");
        return null;
      }

      setStatus("queued");
      setError(null);
      setOutputUrl(null);

      try {
        // 1. content_files row (Media Library tracking)
        const { data: contentFile, error: cfErr } = await contentDB
          .from("content_files")
          .insert({
            file_url: primaryClipUrl,
            file_type: "video",
            source: "ai_video_editor",
            original_filename: opts.title || "AI Video Editor Reel",
          })
          .select("id")
          .single();
        if (cfErr) throw cfErr;

        // 2. video_edit_queue row — render-reel-ffmpeg keys off this id
        const { data: queue, error: qErr } = await contentDB
          .from("video_edit_queue")
          .insert({
            content_file_id: contentFile.id,
            source_url: primaryClipUrl,
            title: opts.title || "AI Video Editor Reel",
            selected_music_url: opts.musicUrl ?? null,
            render_status: "pending",
            status: "ready_for_review",
            ai_creative_id: opts.creativeId ?? null,
          })
          .select("id")
          .single();
        if (qErr) throw qErr;

        // 3. Kick the native ffmpeg renderer
        setStatus("rendering");
        const { data, error: renderErr } = await lovableFunctions.functions.invoke("render-reel-ffmpeg", {
          body: {
            job_id: queue.id,
            blueprint,
            music_url: opts.musicUrl ?? null,
            captions: opts.captions ?? [],
            creative_id: opts.creativeId ?? null,
          },
        });
        if (renderErr) throw renderErr;
        if (data?.ok === false) throw new Error(data?.error || "Render failed");

        // 4a. Synchronous completion
        if (data?.final_url) {
          setOutputUrl(data.final_url);
          setStatus("complete");
          toast.success("Reel rendered");
          return data.final_url;
        }

        // 4b. Async — worker writes video_edit_queue.final_render_url when done
        toast("Rendering your reel…", { description: "This can take a couple of minutes." });
        for (let i = 0; i < 90; i++) {
          await new Promise((r) => setTimeout(r, 4000));
          const { data: row } = await contentDB
            .from("video_edit_queue")
            .select("render_status, final_render_url, error_message")
            .eq("id", queue.id)
            .single();

          if (row?.render_status === "complete" && row.final_render_url) {
            setOutputUrl(row.final_render_url);
            setStatus("complete");
            toast.success("Reel rendered");
            return row.final_render_url;
          }
          if (row?.render_status === "failed") {
            throw new Error(row.error_message || "Render failed");
          }
        }

        // Timed out waiting — the worker may still finish and drop it in the library
        setStatus("failed");
        setError("Render is taking longer than expected");
        toast.error("Render is taking longer than expected", {
          description: "It will appear in your Media Library once the worker finishes.",
        });
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Render failed";
        console.error("[useNativeReelRender] render error:", err);
        setStatus("failed");
        setError(message);
        toast.error("Render failed", { description: message });
        return null;
      }
    },
    []
  );

  return { render, reset, status, isRendering, outputUrl, error };
}
