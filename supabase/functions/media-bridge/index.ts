/**
 * media-bridge — read-only bridge exposing WrapCommand's media factory output
 * to the restylepro marketing agent.
 *
 * Architecture: AI media auto-creation lives in WrapCommand (reel pipeline,
 * ad factory, content library); content planning + human QC live in restylepro
 * (Marketing Hub); publishing runs through restylepro's content-deploy.
 * This bridge is how the restylepro marketing agent sees WrapCommand's usable
 * media so it can attach real images/videos to the posts it plans.
 *
 * POST { action: "list", type?: "video"|"image"|"any", limit?: number }
 *   → { assets: [{ id, file_url, file_type, category, name }] }
 *
 * Read-only — returns public storage URLs only. Applies the same guards as
 * the reel builder: no Google Drive links (unplayable), no inspo_reference
 * items (other people's work — never publish those).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { action?: string; type?: string; limit?: number } = {};
  try { body = await req.json(); } catch { /* */ }
  if ((body.action || "list") !== "list") return json({ error: "action must be 'list'" }, 400);

  // Optional shared-secret gate: enforced only once BRIDGE_SECRET is set.
  const secret = Deno.env.get("BRIDGE_SECRET");
  if (secret && req.headers.get("x-bridge-secret") !== secret) {
    return json({ error: "invalid bridge secret" }, 401);
  }

  const type = body.type === "video" || body.type === "image" ? body.type : "any";
  const limit = Math.min(Number(body.limit) || 20, 40);

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let q = sb.from("content_files")
      .select("id, file_url, file_type, content_category, original_filename, tags, visual_tags, duration_seconds, thumbnail_url, created_at")
      .not("file_url", "is", null)
      .not("file_url", "ilike", "%drive.google.com%")
      .or("content_category.is.null,content_category.neq.inspo_reference")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (type !== "any") q = q.eq("file_type", type);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const assets = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id, file_url: r.file_url, file_type: r.file_type,
      category: r.content_category || "", name: r.original_filename || "",
      tags: (r.tags as string[] | null) ?? [],
      duration_seconds: r.duration_seconds ?? null,
      thumbnail_url: r.thumbnail_url ?? null,
    }));
    return json({ action: "list", type, count: assets.length, assets });
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
