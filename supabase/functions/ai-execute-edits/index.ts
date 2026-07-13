import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClipSegment {
  asset_id: string;
  start_time: number;
  end_time: number;
  label?: string;
}

/**
 * Normalize scene fields so render-reel always gets what it expects.
 * render-reel reads: start, end, text, textPosition, animation, clipUrl, sceneId, clipId
 * AI blueprints may send: start_time/end_time, text_overlay, text_position, clip_url, scene_id, clip_id
 * This function maps ALL naming conventions to the canonical form in ONE place.
 */
function normalizeSceneForRender(
  scene: any,
  index: number,
  fallbackClipUrl: string,
  approvedOverlay?: any
): any {
  const start = Number(scene.start ?? scene.start_time ?? 0);
  const endRaw = Number(scene.end ?? scene.end_time ?? (start + 3));
  const end = endRaw > start ? endRaw : start + 3;

  // Approved overlay takes priority > blueprint text_overlay > blueprint text
  const text = approvedOverlay?.text || scene.text_overlay || scene.text || undefined;
  const textPosition = approvedOverlay?.position || scene.text_position || scene.textPosition || 'center';
  const animation = approvedOverlay?.animation || scene.animation || 'pop';

  return {
    sceneId: scene.sceneId || scene.scene_id || `scene_${index + 1}`,
    clipId: scene.clipId || scene.clip_id || `clip_${index + 1}`,
    clipUrl: scene.clipUrl || scene.clip_url || scene.file_url || fallbackClipUrl,
    start,
    end,
    purpose: scene.purpose || scene.label || 'content',
    text,
    textPosition,
    animation,
    cutReason: scene.cut_reason || scene.cutReason || undefined,
    overlayApproved: !!approvedOverlay,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[ai-execute-edits] ====== FUNCTION INVOKED ======");

  // Early variable declarations for debug payload
  let videoEditId: string | null = null;
  let supabase: any = null;

  try {
    // Mux is OPTIONAL — the reel renders via the ffmpeg worker (render-reel-ffmpeg),
    // which needs no Mux. Mux is only used for the OPTIONAL shorts branch. Do NOT
    // hard-fail when it's missing, or the working reel path is blocked.
    const MUX_TOKEN_ID = Deno.env.get("MUX_TOKEN_ID");
    const MUX_TOKEN_SECRET = Deno.env.get("MUX_TOKEN_SECRET");
    const muxAvailable = !!MUX_TOKEN_ID && !!MUX_TOKEN_SECRET;
    console.log("[ai-execute-edits] Mux available (shorts only):", muxAvailable);

    const body = await req.json();
    console.log("[ai-execute-edits] Request body:", JSON.stringify(body));
    
    const { video_edit_id, render_type = "full", organization_id } = body;
    videoEditId = video_edit_id;

    if (!video_edit_id) {
      console.error("[ai-execute-edits] Missing video_edit_id");
      return new Response(
        JSON.stringify({ success: false, error: "video_edit_id required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseKey) {
      console.error("[ai-execute-edits] FATAL: Supabase credentials not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Supabase credentials not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the video edit queue item
    console.log("[ai-execute-edits] Fetching video edit item:", video_edit_id);
    
    const { data: editItem, error: fetchError } = await supabase
      .from("video_edit_queue")
      .select("*")
      .eq("id", video_edit_id)
      .single();

    if (fetchError || !editItem) {
      console.error("[ai-execute-edits] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: `Video edit item not found: ${fetchError?.message || 'No data'}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    console.log("[ai-execute-edits] Found video edit item:", {
      id: editItem.id,
      title: editItem.title,
      source_url: editItem.source_url,
      content_file_id: editItem.content_file_id,
      duration: editItem.duration_seconds
    });

    // Update status to processing
    console.log("[ai-execute-edits] Updating status to processing...");
    await supabase
      .from("video_edit_queue")
      .update({ render_status: "processing", status: "rendering" })
      .eq("id", video_edit_id);

    const aiSuggestions = editItem.ai_edit_suggestions || {};
    
    // ✅ RUN 1: Console log before processing scenes
    console.log("[ai-execute-edits] EXECUTING WITH AI_SUGGESTIONS:", JSON.stringify(aiSuggestions, null, 2));
    
    // Get the Mux asset ID
    let muxAssetId: string | null = null;
    let muxPlaybackId: string | null = null;
    
    // Try to get from content_files
    if (editItem.content_file_id) {
      console.log("[ai-execute-edits] Looking up content_file:", editItem.content_file_id);
      
      const { data: contentFile } = await supabase
        .from("content_files")
        .select("mux_asset_id, mux_playback_id, file_url")
        .eq("id", editItem.content_file_id)
        .single();
      
      if (contentFile) {
        console.log("[ai-execute-edits] Content file found:", contentFile);
        muxAssetId = contentFile.mux_asset_id;
        muxPlaybackId = contentFile.mux_playback_id;
      }
    }

    // ✅ MUX IS NOW OPTIONAL - We can render directly from Supabase Storage URLs
    // Only attempt Mux upload if we DON'T have a direct source URL
    // render-reel uses clipUrl directly, so Mux is not required
    
    if (!muxAssetId && !editItem.source_url) {
      // No Mux asset AND no source URL = cannot render
      console.error("[ai-execute-edits] No video source available (no Mux asset, no source URL)");
      await updateQueueFailed(supabase, video_edit_id, "No video source URL available", {
        stage: "source_check",
        ai_edit_suggestions: aiSuggestions,
        source_url: editItem.source_url,
        content_file_id: editItem.content_file_id,
        render_type,
      });
      return new Response(
        JSON.stringify({ success: false, error: "No video source URL available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Log video source strategy
    if (muxAssetId) {
      console.log("[ai-execute-edits] Using Mux asset:", muxAssetId);
    } else {
      console.log("[ai-execute-edits] ✅ Using direct Supabase Storage URL (Mux bypassed):", editItem.source_url?.substring(0, 80));
    }
    let renderResult = null;
    const shortsResults: any[] = [];
    const videoDuration = editItem.duration_seconds || 60;

    // FULL REEL: Use Creatomate renderer (render-reel)
    if (render_type === "full" || render_type === "all") {
      console.log("[ai-execute-edits] Creating full reel via Creatomate...");
      
      // AUTHORITY CHECK: Blueprint scenes are REQUIRED
      const scenes = aiSuggestions.scenes || [];
      const blueprintId = aiSuggestions.blueprint_id;
      const blueprintSource = aiSuggestions.blueprint_source;
      
      // ============ NEW: Extract format lock fields ============
      const format = aiSuggestions.format || 'reel';
      const aspectRatio = aiSuggestions.aspect_ratio || '9:16';
      const templateId = aiSuggestions.template_id || 'ig_reel_v1';
      const overlayPack = aiSuggestions.overlay_pack || 'wpw_signature';
      const font = aiSuggestions.font || 'Inter Black';
      const textStyle = aiSuggestions.text_style || 'bold';
      const caption = aiSuggestions.caption;
      
      console.log("[ai-execute-edits] Blueprint check:", {
        blueprint_id: blueprintId,
        blueprint_source: blueprintSource,
        scenes_count: scenes.length,
        format,
        aspect_ratio: aspectRatio,
        template_id: templateId,
        overlay_pack: overlayPack,
      });
      
      // HARD STOP: No blueprint = No render
      if (!blueprintId || scenes.length === 0) {
        console.error("[ai-execute-edits] AUTHORITY VIOLATION: No valid blueprint provided");
        await updateQueueFailed(supabase, video_edit_id, "Render blocked: No scene blueprint provided. Authority required.", {
          stage: "authority_check",
          ai_edit_suggestions: aiSuggestions,
          blueprint_id: blueprintId,
          scenes_count: scenes.length,
          render_type,
        });
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Render blocked: No scene blueprint provided.",
            authority_check: "FAILED",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
      
      console.log("[ai-execute-edits] AUTHORITY PASSED: Using blueprint", blueprintId, "with", scenes.length, "scenes");
      
      // Source video URL — scenes are time-based trims from this
      const sourceVideoUrl = editItem.source_url;

      // ============ FETCH APPROVED OVERLAYS FROM scene_text_overlays ============
      console.log("[ai-execute-edits] Fetching approved overlays for job:", video_edit_id);
      const { data: approvedOverlays } = await supabase
        .from("scene_text_overlays")
        .select("*")
        .eq("job_id", video_edit_id)
        .eq("approved", true);

      const approvedOverlayMap = new Map<string, any>();
      if (approvedOverlays && approvedOverlays.length > 0) {
        console.log("[ai-execute-edits] Found", approvedOverlays.length, "approved overlays");
        for (const overlay of approvedOverlays) {
          approvedOverlayMap.set(overlay.scene_id, overlay);
        }
      } else {
        console.log("[ai-execute-edits] No approved overlays found - using blueprint text");
      }

      // ============ NORMALIZE ALL SCENES VIA SINGLE FUNCTION ============
      const blueprintScenes = scenes.slice(0, 8).map((scene: any, i: number) => {
        const sceneId = scene.sceneId || scene.scene_id || `scene_${i + 1}`;
        const approvedOverlay = approvedOverlayMap.get(sceneId);
        return normalizeSceneForRender(scene, i, sourceVideoUrl, approvedOverlay);
      }).filter((s: any) => s.clipUrl && s.end > s.start);

      if (blueprintScenes.length === 0) {
        console.error("[ai-execute-edits] Blueprint had scenes but none were valid");
        await updateQueueFailed(supabase, video_edit_id, "Blueprint scenes were invalid (no valid time ranges)", {
          stage: "scene_validation",
          ai_edit_suggestions: aiSuggestions,
          scenes_parsed: scenes.length,
          clips_valid: 0,
          render_type,
        });
        return new Response(
          JSON.stringify({ success: false, error: "No valid clips in blueprint" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Calculate total duration from normalized scenes
      let cursor = 0;
      for (const s of blueprintScenes) {
        cursor += (s.end - s.start);
      }

      console.log("[ai-execute-edits] Calling render-reel with", blueprintScenes.length, "scenes");

      try {
        
        console.log("[ai-execute-edits] Blueprint scenes built:", blueprintScenes.length,
          "from source:", sourceVideoUrl?.substring(0, 50) + "...",
          "with approved overlays:", approvedOverlays?.length || 0);

        const blueprint = {
          id: blueprintId || `bp_${video_edit_id}`,
          platform: 'instagram',
          totalDuration: cursor,
          scenes: blueprintScenes,
          endCard: aiSuggestions.end_card || undefined,
          brand: editItem.brand || 'wpw',
          format,
          aspectRatio,
          templateId,
          overlayPack,
          font,
          textStyle,
          caption,
        };
        
        console.log("[ai-execute-edits] Built SceneBlueprint:", JSON.stringify({
          id: blueprint.id,
          scenes_count: blueprint.scenes.length,
          format: blueprint.format,
          aspectRatio: blueprint.aspectRatio,
          templateId: blueprint.templateId,
          approved_overlays: approvedOverlays?.length || 0,
        }));
        
        // REEL_RENDERER=ffmpeg → self-hosted renderer; else legacy Creatomate.
        // Same request/response contract either way.
        const reelRenderFn = Deno.env.get("REEL_RENDERER") === "creatomate"
          ? "render-reel"
          : "render-reel-ffmpeg";
        const renderRes = await supabase.functions.invoke(reelRenderFn, {
          body: {
            job_id: video_edit_id,
            blueprint,
            music_url: editItem.selected_music_url,
          }
        });
        
        console.log("[ai-execute-edits] render-reel response:", JSON.stringify(renderRes.data));
        
        if (renderRes.error) {
          console.error("[ai-execute-edits] render-reel error:", renderRes.error);
          renderResult = { success: false, error: renderRes.error.message };
        } else if (renderRes.data?.ok === false) {
          console.error("[ai-execute-edits] render-reel returned failure:", renderRes.data.error);
          renderResult = { success: false, ...renderRes.data };
        } else {
          // The ffmpeg renderer returns status:"processing" with final_url:null when
          // the GitHub-Actions job hasn't finished inside the ~100s wait (the norm).
          // Only mark ready when a real URL exists — otherwise the queue row would be
          // set to "complete" with a null final_render_url and polling would stop.
          const finalUrl = renderRes.data?.final_url ?? null;
          const isReady = renderRes.data?.status !== "processing" && !!finalUrl;
          renderResult = {
            success: true,
            download_url: finalUrl,
            ...renderRes.data,
            ready: isReady,
          };
        }
      } catch (e) {
        console.error("[ai-execute-edits] render-reel exception:", e);
        renderResult = { success: false, error: e instanceof Error ? e.message : 'Unknown' };
      }
    }

    // SHORTS: Extract individual clips
    if ((render_type === "shorts" || render_type === "all") && !muxAvailable) {
      console.warn("[ai-execute-edits] Skipping shorts — Mux not configured (reel still renders via ffmpeg)");
    }
    if ((render_type === "shorts" || render_type === "all") && muxAvailable) {
      console.log("[ai-execute-edits] Extracting shorts...");

      const shorts = aiSuggestions.shorts || aiSuggestions.broll_cues || aiSuggestions.viral_moments || [];
      console.log("[ai-execute-edits] Found", shorts.length, "shorts to extract");
      
      for (const short of shorts.slice(0, 5)) {
        try {
          const startTime = parseFloat(short.start_time || short.timestamp || short.start || 0);
          const duration = parseFloat(short.duration || 15);
          const endTime = parseFloat(short.end_time || short.end || (startTime + duration));
          
          console.log("[ai-execute-edits] Creating short:", startTime, "to", endTime);
          
          const clipRes = await supabase.functions.invoke("mux-create-clip", {
            body: {
              asset_id: muxAssetId,
              playback_id: muxPlaybackId,
              start_time: startTime,
              end_time: Math.min(endTime, videoDuration),
              output_name: short.title || short.suggestion || `Short ${shortsResults.length + 1}`,
              create_permanent: true
            }
          });
          
          if (clipRes.data?.success) {
            shortsResults.push({
              ...clipRes.data,
              label: short.title || short.suggestion,
              hook: short.hook,
              cta: short.cta
            });
          }
        } catch (e) {
          console.error("[ai-execute-edits] Short clip error:", e);
        }
      }
    }

    // Update queue with results
    console.log("[ai-execute-edits] Updating queue with results...");
    
    const isSuccess = renderResult?.success || shortsResults.length > 0;
    const isComplete = renderResult?.ready === true;
    
    // ✅ RUN 1 + RUN 4: Build debug payload for success case
    const debugPayload = {
      stage: "complete",
      mux_asset_id: muxAssetId,
      render_type,
      clips_rendered: aiSuggestions.scenes?.length || 0,
      overlays_applied: aiSuggestions.scenes?.filter((s: any) => s.text || s.text_overlay).length || 0,
      blueprint_id: aiSuggestions.blueprint_id,
      blueprint_source: aiSuggestions.blueprint_source,
      // ============ NEW: Include format lock fields ============
      format: aiSuggestions.format,
      aspect_ratio: aiSuggestions.aspect_ratio,
      template_id: aiSuggestions.template_id,
      overlay_pack: aiSuggestions.overlay_pack,
      font: aiSuggestions.font,
      text_style: aiSuggestions.text_style,
      caption: aiSuggestions.caption,
      render_result: renderResult,
      shorts_count: shortsResults.length,
    };
    
    const updateData: any = {
      render_status: isComplete ? "complete" : (isSuccess ? "processing" : "failed"),
      status: isComplete ? "complete" : (isSuccess ? "rendering" : "error"),
      updated_at: new Date().toISOString(),
      debug_payload: debugPayload, // ✅ Always write debug payload
    };

    if (renderResult?.download_url) {
      updateData.final_render_url = renderResult.download_url;
    }

    if (shortsResults.length > 0) {
      updateData.shorts_extracted = shortsResults;
    }
    
    // ✅ If render failed, also write error_message
    if (!isSuccess && renderResult?.error) {
      updateData.error_message = renderResult.error;
    }

    console.log("[ai-execute-edits] Update data:", JSON.stringify(updateData));

    await supabase
      .from("video_edit_queue")
      .update(updateData)
      .eq("id", video_edit_id);

    // ✅ RUN 4: Insert into content_files when render completes successfully
    if (isComplete && renderResult?.download_url) {
      console.log("[ai-execute-edits] 🎉 Render complete - inserting into content_files for ContentBox...");
      
      try {
        const contentFileInsert = {
          file_type: "video",
          file_url: renderResult.download_url,
          thumbnail_url: null, // Could be added later via Mux thumbnail
          content_category: "rendered",
          processing_status: "ready",
          organization_id: editItem.organization_id || null,
          source: "mightyedit",
          brand: editItem.brand || "wpw",
          original_filename: `Rendered-${video_edit_id.slice(0, 8)}.mp4`,
          metadata: {
            source: "mightyedit",
            video_edit_queue_id: video_edit_id,
            task_id: editItem.task_id || null,
            content_calendar_id: editItem.content_calendar_id || aiSuggestions.content_calendar_id || null,
            agent_name: editItem.agent_name || aiSuggestions.agent_name || null,
            blueprint_id: aiSuggestions.blueprint_id,
            status: editItem.scheduled_at ? "scheduled" : "completed",
            rendered_at: new Date().toISOString(),
          },
          tags: ["ai-rendered", "mightyedit", "auto-generated"],
          ai_labels: {
            render_type,
            clips_count: aiSuggestions.scenes?.length || 0,
            concept: editItem.title,
          },
        };

        const { data: insertedFile, error: insertError } = await supabase
          .from("content_files")
          .insert(contentFileInsert)
          .select("id")
          .single();

        if (insertError) {
          console.error("[ai-execute-edits] Failed to insert content_file:", insertError);
        } else {
          console.log("[ai-execute-edits] ✅ Content file created:", insertedFile.id);
          // Update the queue with the content_file reference
          await supabase
            .from("video_edit_queue")
            .update({ rendered_content_file_id: insertedFile.id })
            .eq("id", video_edit_id);
        }
      } catch (cfError) {
        console.error("[ai-execute-edits] Exception inserting content_file:", cfError);
        // Don't fail the whole request - the render succeeded
      }
    }

    const response = {
      success: isSuccess,
      video_edit_id,
      mux_asset_id: muxAssetId,
      render_result: renderResult,
      shorts_count: shortsResults.length,
      shorts: shortsResults,
      download_url: renderResult?.download_url || null,
      ready: isComplete
    };

    console.log("[ai-execute-edits] ====== FUNCTION COMPLETE ======");
    console.log("[ai-execute-edits] Response:", JSON.stringify(response));

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[ai-execute-edits] FATAL ERROR:", err);
    
    // ✅ RUN 1: Try to update queue with error if we have the context
    if (supabase && videoEditId) {
      try {
        await updateQueueFailed(supabase, videoEditId, `Fatal error: ${err instanceof Error ? err.message : 'Unknown'}`, {
          stage: "fatal_catch",
          exception: err instanceof Error ? err.stack : String(err),
        });
      } catch (updateErr) {
        console.error("[ai-execute-edits] Failed to update queue with fatal error:", updateErr);
      }
    }
    
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// ✅ RUN 1: Helper to update queue with failure - NOW WRITES error_message + debug_payload
async function updateQueueFailed(supabase: any, videoEditId: string, error: string, debugPayload?: any) {
  console.log("[ai-execute-edits] updateQueueFailed called:", { videoEditId, error, hasDebugPayload: !!debugPayload });
  
  await supabase
    .from("video_edit_queue")
    .update({ 
      render_status: "failed", 
      status: "error",
      error_message: error, // ✅ NOW PERSISTED
      debug_payload: debugPayload || { error_only: true, message: error }, // ✅ NOW PERSISTED
      updated_at: new Date().toISOString() 
    })
    .eq("id", videoEditId);
}
