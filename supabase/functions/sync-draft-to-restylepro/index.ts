/**
 * sync-draft-to-restylepro — bridge from WrapCommandAI's content factory into
 * the UNIFIED deployment loop in the RestylePro project.
 *
 * WrapCommandAI owns the heavy media production (Mux reel pipeline, video
 * editors, ad factory) but its own publish-content executor is single-account
 * and Instagram-only. The sanctioned publisher is restylepro's content-deploy
 * (brand-aware Meta connections, scheduling cron, retries, failure
 * escalation). This bridge hands a finished content_drafts row to that loop
 * via restylepro's content-intake function — it does NOT publish anything
 * itself.
 *
 * Request (POST JSON):
 * {
 *   "content_draft_id": "<uuid>",          // required
 *   "brand": "weprintwraps" | "restylepro" // default weprintwraps (this IS the WPW shop)
 *   "scheduled_date": ISO timestamp        // optional; defaults to draft.scheduled_for
 * }
 *
 * Required function secrets:
 *   RESTYLEPRO_FUNCTIONS_URL   e.g. https://kfapjdyythzyvnpdeghu.supabase.co/functions/v1
 *   RESTYLEPRO_INTAKE_SECRET   same value as content-intake's CONTENT_INTAKE_SECRET
 *
 * On success the draft is marked status 'scheduled' with the restylepro post
 * id recorded in platform_post_id as "rp:<uuid>" (the content_drafts table
 * has no metadata column; the rp: prefix distinguishes it from a real
 * platform post id, which is only set after actual publication).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { content_draft_id, brand, scheduled_date } = await req.json();
    if (!content_draft_id) return json({ error: "content_draft_id required" }, 400);

    const intakeUrl = Deno.env.get("RESTYLEPRO_FUNCTIONS_URL");
    const intakeSecret = Deno.env.get("RESTYLEPRO_INTAKE_SECRET");
    if (!intakeUrl || !intakeSecret) {
      return json(
        { error: "RESTYLEPRO_FUNCTIONS_URL and RESTYLEPRO_INTAKE_SECRET secrets must be configured" },
        500,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: draft, error: draftError } = await supabase
      .from("content_drafts")
      .select("*")
      .eq("id", content_draft_id)
      .single();
    if (draftError || !draft) return json({ error: `Content draft not found: ${content_draft_id}` }, 404);

    if (draft.status === "published") {
      return json({ error: "Draft is already published" }, 400);
    }
    if (!draft.media_url && !draft.caption) {
      return json({ error: "Draft has no media_url and no caption — nothing to send" }, 400);
    }

    // content_drafts content_type → agent_social_posts post_type
    const postType =
      draft.content_type === "reel" || draft.content_type === "video"
        ? "reel"
        : draft.content_type === "story"
          ? "story"
          : "static";

    const res = await fetch(`${intakeUrl}/content-intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-intake-secret": intakeSecret,
      },
      body: JSON.stringify({
        brand: brand || "weprintwraps",
        platform: draft.platform || "instagram",
        post_type: postType,
        caption: draft.caption,
        hashtags: draft.hashtags || [],
        media_urls: draft.media_url ? [draft.media_url] : [],
        scheduled_date: scheduled_date || draft.scheduled_for || null,
        source: `wrapcommandai:content_drafts:${draft.id}`,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) {
      return json({ error: `content-intake rejected the draft: ${out.error || res.status}` }, 502);
    }

    await supabase
      .from("content_drafts")
      .update({
        status: "scheduled",
        platform_post_id: `rp:${out.post_id}`,
        publish_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", content_draft_id);

    console.log(`[sync-draft-to-restylepro] draft ${content_draft_id} → restylepro post ${out.post_id} (${out.status})`);
    return json({ ok: true, draft_id: content_draft_id, restylepro_post_id: out.post_id, status: out.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-draft-to-restylepro] error", msg);
    return json({ error: msg }, 500);
  }
});
