import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl =
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const supabaseKey =
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 5;

    console.log("[process-content-parse-queue] Starting batch processing...");

    // Fetch pending parse actions
    const { data: actions, error: fetchErr } = await supabase
      .from("ai_actions")
      .select("*")
      .eq("action_type", "parse_content_file")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchErr) {
      throw new Error(`Failed to fetch actions: ${fetchErr.message}`);
    }

    if (!actions || actions.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No pending parse actions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-content-parse-queue] Found ${actions.length} pending parse actions`);
    let processed = 0;
    let failed = 0;

    for (const action of actions) {
      const payload = action.payload || {};
      const contentFileId = payload.content_file_id;
      const fileUrl = payload.file_url;
      const fileType = payload.file_type || "image";

      if (!contentFileId || !fileUrl) {
        console.error("[process-content-parse-queue] Missing content_file_id or file_url:", action.id);
        await supabase
          .from("ai_actions")
          .update({ status: "failed", result: { error: "Missing required fields" } })
          .eq("id", action.id);
        failed++;
        continue;
      }

      try {
        // Mark as processing
        await supabase
          .from("ai_actions")
          .update({ status: "processing" })
          .eq("id", action.id);

        // Call ai-parse-content
        const { data: parseResult, error: parseErr } = await supabase.functions.invoke(
          "ai-parse-content",
          {
            body: {
              contentFileId,
              imageUrl: fileUrl,
              fileType,
            },
          }
        );

        if (parseErr) {
          console.error(`[process-content-parse-queue] Parse error for ${contentFileId}:`, parseErr);
          await supabase
            .from("ai_actions")
            .update({ status: "failed", result: { error: parseErr.message } })
            .eq("id", action.id);
          failed++;
        } else {
          await supabase
            .from("ai_actions")
            .update({ status: "completed", result: parseResult })
            .eq("id", action.id);
          processed++;
        }
      } catch (err) {
        console.error(`[process-content-parse-queue] Exception for ${contentFileId}:`, err);
        await supabase
          .from("ai_actions")
          .update({
            status: "failed",
            result: { error: err instanceof Error ? err.message : "Unknown error" },
          })
          .eq("id", action.id);
        failed++;
      }

      // Rate limit: small delay between calls
      if (actions.indexOf(action) < actions.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    const result = { ok: true, processed, failed, total: actions.length };
    console.log("[process-content-parse-queue] Done:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[process-content-parse-queue] Fatal error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
