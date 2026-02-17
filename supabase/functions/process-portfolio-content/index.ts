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
    console.log("[process-portfolio-content] Starting...");

    // Fetch pending portfolio_to_contentbox actions
    const { data: actions, error: fetchErr } = await supabase
      .from("ai_actions")
      .select("*")
      .eq("action_type", "portfolio_to_contentbox")
      .eq("status", "pending")
      .limit(10);

    if (fetchErr) {
      console.error("[process-portfolio-content] Fetch error:", fetchErr);
      throw new Error(`Failed to fetch actions: ${fetchErr.message}`);
    }

    if (!actions || actions.length === 0) {
      console.log("[process-portfolio-content] No pending actions found");
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No pending actions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-portfolio-content] Found ${actions.length} pending actions`);
    let processed = 0;
    let failed = 0;

    for (const action of actions) {
      try {
        const payload = action.payload || {};
        const portfolioJobId = payload.portfolio_job_id || payload.context?.portfolio_job_id;

        if (!portfolioJobId) {
          console.error("[process-portfolio-content] Missing portfolio_job_id in action:", action.id);
          await supabase
            .from("ai_actions")
            .update({ status: "failed", result: { error: "Missing portfolio_job_id" } })
            .eq("id", action.id);
          failed++;
          continue;
        }

        console.log(`[process-portfolio-content] Processing job: ${portfolioJobId}`);

        // Fetch portfolio job for vehicle info
        const { data: job, error: jobErr } = await supabase
          .from("portfolio_jobs")
          .select("id, title, vehicle_make, vehicle_model, vehicle_year, finish, service_type, organization_id, tags")
          .eq("id", portfolioJobId)
          .single();

        if (jobErr || !job) {
          console.error("[process-portfolio-content] Job not found:", portfolioJobId, jobErr);
          await supabase
            .from("ai_actions")
            .update({ status: "failed", result: { error: `Job not found: ${jobErr?.message}` } })
            .eq("id", action.id);
          failed++;
          continue;
        }

        // Fetch media for this portfolio job
        const { data: media, error: mediaErr } = await supabase
          .from("portfolio_media")
          .select("*")
          .eq("job_id", portfolioJobId)
          .order("display_order", { ascending: true });

        if (mediaErr) {
          console.error("[process-portfolio-content] Media fetch error:", mediaErr);
          await supabase
            .from("ai_actions")
            .update({ status: "failed", result: { error: `Media fetch failed: ${mediaErr.message}` } })
            .eq("id", action.id);
          failed++;
          continue;
        }

        if (!media || media.length === 0) {
          console.log("[process-portfolio-content] No media found for job:", portfolioJobId);
          await supabase
            .from("ai_actions")
            .update({ status: "completed", result: { message: "No media to process", media_count: 0 } })
            .eq("id", action.id);
          processed++;
          continue;
        }

        console.log(`[process-portfolio-content] Found ${media.length} media files for job ${portfolioJobId}`);

        // Build tags from job metadata
        const tags: string[] = ["portfolio"];
        if (job.vehicle_make) tags.push(job.vehicle_make.toLowerCase());
        if (job.vehicle_model) tags.push(job.vehicle_model.toLowerCase());
        if (job.finish) tags.push(job.finish.toLowerCase());
        if (job.service_type) tags.push(job.service_type.toLowerCase());
        if (job.tags) tags.push(...job.tags);

        // Determine if before/after based on media_type
        let insertedCount = 0;

        for (const item of media) {
          // Build the public URL from storage_path
          const fileUrl = item.storage_path.startsWith("http")
            ? item.storage_path
            : `${supabaseUrl}/storage/v1/object/public/portfolio/${item.storage_path}`;

          const mediaTags = [...tags];
          if (item.media_type === "before") mediaTags.push("before");
          if (item.media_type === "after") mediaTags.push("after");
          if (item.location_on_vehicle) mediaTags.push(item.location_on_vehicle.toLowerCase());

          // Check if already exists (idempotent)
          const { data: existing } = await supabase
            .from("content_files")
            .select("id")
            .eq("source", "portfolio")
            .eq("source_id", item.id)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log(`[process-portfolio-content] Skipping duplicate: ${item.id}`);
            continue;
          }

          const { error: insertErr } = await supabase
            .from("content_files")
            .insert({
              file_type: item.file_type || "image",
              file_url: fileUrl,
              source: "portfolio",
              source_id: item.id,
              brand: "wpw",
              organization_id: job.organization_id,
              original_filename: item.storage_path.split("/").pop() || "portfolio-media",
              tags: mediaTags,
              content_category: item.media_type === "before" ? "before_after" : "portfolio",
              processing_status: "ready",
              vehicle_info: {
                make: job.vehicle_make,
                model: job.vehicle_model,
                year: job.vehicle_year,
                finish: job.finish,
                service_type: job.service_type,
              },
              metadata: {
                portfolio_job_id: portfolioJobId,
                portfolio_media_id: item.id,
                media_type: item.media_type,
                location_on_vehicle: item.location_on_vehicle,
                caption: item.caption,
              },
            });

          if (insertErr) {
            console.error(`[process-portfolio-content] Insert error for media ${item.id}:`, insertErr);
          } else {
            insertedCount++;
          }
        }

        console.log(`[process-portfolio-content] Inserted ${insertedCount} content files for job ${portfolioJobId}`);

        // Mark action as completed
        await supabase
          .from("ai_actions")
          .update({
            status: "completed",
            result: {
              media_found: media.length,
              inserted: insertedCount,
              job_title: job.title,
            },
          })
          .eq("id", action.id);

        processed++;
      } catch (actionErr) {
        console.error("[process-portfolio-content] Action error:", actionErr);
        await supabase
          .from("ai_actions")
          .update({
            status: "failed",
            result: { error: actionErr instanceof Error ? actionErr.message : "Unknown error" },
          })
          .eq("id", action.id);
        failed++;
      }
    }

    const result = { ok: true, processed, failed, total: actions.length };
    console.log("[process-portfolio-content] Done:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[process-portfolio-content] Fatal error:", error);
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
