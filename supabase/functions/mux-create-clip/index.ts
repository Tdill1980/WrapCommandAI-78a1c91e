import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClipRequest {
  asset_id: string;        // Mux asset ID
  playback_id?: string;    // Mux playback ID (for instant clips)
  start_time: number;      // Start time in seconds
  end_time: number;        // End time in seconds
  output_name?: string;    // Optional name for the clip
  create_permanent?: boolean; // If true, creates a new Mux asset; otherwise returns instant clip URL
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MUX_TOKEN_ID = Deno.env.get("MUX_TOKEN_ID");
    const MUX_TOKEN_SECRET = Deno.env.get("MUX_TOKEN_SECRET");

    if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
      throw new Error("Mux credentials not configured");
    }

    const { 
      asset_id, 
      playback_id, 
      start_time, 
      end_time, 
      output_name,
      create_permanent = false 
    }: ClipRequest = await req.json();

    if (!asset_id || start_time === undefined || end_time === undefined) {
      return new Response(
        JSON.stringify({ error: "asset_id, start_time, and end_time are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const duration = end_time - start_time;
    console.log(`[mux-create-clip] Creating clip from asset ${asset_id}: ${start_time}s to ${end_time}s (${duration}s)`);

    // Method 1: Instant playback clip (no new asset, just URL with time params)
    if (!create_permanent && playback_id) {
      const instantClipUrl = `https://stream.mux.com/${playback_id}.m3u8?start=${start_time}&end=${end_time}`;
      const mp4Url = `https://stream.mux.com/${playback_id}/high.mp4?start=${start_time}&end=${end_time}`;
      
      console.log(`[mux-create-clip] Created instant clip URL: ${instantClipUrl}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          clip_type: "instant",
          playback_url: instantClipUrl,
          download_url: mp4Url,
          start_time,
          end_time,
          duration,
          name: output_name || `Clip ${start_time}s-${end_time}s`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Method 2: Create permanent clip (new Mux asset from clip range)
    const muxAuth = btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`);
    
    const createAssetResponse = await fetch("https://api.mux.com/video/v1/assets", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${muxAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [{
          url: `mux://assets/${asset_id}`,
          start_time: start_time,
          end_time: end_time
        }],
        playback_policy: ["public"],
        // mp4_support is deprecated (Mux rejects it — see mux-upload's note).
        // static_renditions is the current way to get a downloadable MP4.
        static_renditions: [{ resolution: "highest" }]
      })
    });

    if (!createAssetResponse.ok) {
      const errorText = await createAssetResponse.text();
      console.error(`[mux-create-clip] Mux API error:`, errorText);
      throw new Error(`Mux API error: ${createAssetResponse.status} - ${errorText}`);
    }

    const assetData = await createAssetResponse.json();
    let newAsset = assetData.data;

    console.log(`[mux-create-clip] Created new asset: ${newAsset.id}`);

    // Poll until the clip asset is ready (max ~90s). Previously we returned
    // immediately while status was "preparing", so Download/Preview 404'd.
    const deadline = Date.now() + 90_000;
    while (newAsset.status !== "ready" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(`https://api.mux.com/video/v1/assets/${newAsset.id}`, {
        headers: { "Authorization": `Basic ${muxAuth}` },
      });
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        newAsset = statusJson.data;
        if (newAsset.status === "errored") {
          throw new Error(`Mux clip asset errored: ${JSON.stringify(newAsset.errors || {})}`);
        }
      }
    }
    console.log(`[mux-create-clip] Asset ${newAsset.id} status: ${newAsset.status}`);

    // Get playback ID from the new asset
    const newPlaybackId = newAsset.playback_ids?.[0]?.id;

    return new Response(
      JSON.stringify({
        success: true,
        clip_type: "permanent",
        asset_id: newAsset.id,
        playback_id: newPlaybackId,
        playback_url: newPlaybackId ? `https://stream.mux.com/${newPlaybackId}.m3u8` : null,
        download_url: newPlaybackId ? `https://stream.mux.com/${newPlaybackId}/highest.mp4` : null,
        thumbnail_url: newPlaybackId ? `https://image.mux.com/${newPlaybackId}/thumbnail.jpg` : null,
        start_time,
        end_time,
        duration,
        status: newAsset.status,
        ready: newAsset.status === "ready",
        name: output_name || `Clip ${start_time}s-${end_time}s`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[mux-create-clip] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
