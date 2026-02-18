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
    const dryRun = body.dry_run === true;
    const source = body.source || "all"; // "portfolio", "renders", "queue", "all"

    console.log(`[backfill-content-tags] Starting backfill (dry_run=${dryRun}, source=${source})`);

    const stats = { portfolio: 0, renders: 0, queue: 0, skipped: 0, errors: 0 };

    // Helper: check if content_file already exists for a source
    async function alreadyExists(sourceType: string, sourceId: string): Promise<boolean> {
      const { data } = await supabase
        .from("content_files")
        .select("id")
        .eq("source", sourceType)
        .eq("source_id", sourceId)
        .limit(1);
      return (data && data.length > 0) || false;
    }

    // 1. Portfolio Media
    if (source === "all" || source === "portfolio") {
      console.log("[backfill-content-tags] Scanning portfolio_media...");

      const { data: portfolioMedia, error: pmErr } = await supabase
        .from("portfolio_media")
        .select("id, job_id, storage_path, file_type, media_type, location_on_vehicle, caption")
        .limit(200);

      if (pmErr) {
        console.error("[backfill-content-tags] portfolio_media error:", pmErr);
      } else if (portfolioMedia) {
        for (const pm of portfolioMedia) {
          if (await alreadyExists("portfolio", pm.id)) {
            stats.skipped++;
            continue;
          }

          const fileUrl = pm.storage_path.startsWith("http")
            ? pm.storage_path
            : `${supabaseUrl}/storage/v1/object/public/portfolio/${pm.storage_path}`;

          // Fetch job for vehicle info
          const { data: job } = await supabase
            .from("portfolio_jobs")
            .select("vehicle_make, vehicle_model, vehicle_year, finish, service_type, organization_id, tags")
            .eq("id", pm.job_id)
            .single();

          const tags: string[] = ["portfolio", "backfill"];
          if (job?.vehicle_make) tags.push(job.vehicle_make.toLowerCase());
          if (job?.vehicle_model) tags.push(job.vehicle_model.toLowerCase());
          if (job?.finish) tags.push(job.finish.toLowerCase());
          if (pm.media_type) tags.push(pm.media_type);
          if (pm.location_on_vehicle) tags.push(pm.location_on_vehicle.toLowerCase());

          if (!dryRun) {
            const { error: insErr } = await supabase.from("content_files").insert({
              file_type: pm.file_type || "image",
              file_url: fileUrl,
              source: "portfolio",
              source_id: pm.id,
              brand: "wpw",
              organization_id: job?.organization_id || null,
              tags,
              content_category: pm.media_type === "before" ? "before_after" : "portfolio",
              processing_status: "ready",
              vehicle_info: job
                ? {
                    make: job.vehicle_make,
                    model: job.vehicle_model,
                    year: job.vehicle_year,
                    finish: job.finish,
                  }
                : null,
            });
            if (insErr) {
              console.error("[backfill-content-tags] Insert error:", insErr);
              stats.errors++;
            } else {
              stats.portfolio++;
            }
          } else {
            stats.portfolio++;
          }
        }
      }
    }

    // 2. ApproveFlow 3D Renders
    if (source === "all" || source === "renders") {
      console.log("[backfill-content-tags] Scanning approveflow_3d...");

      const { data: renders, error: rErr } = await supabase
        .from("approveflow_3d")
        .select("id, order_id, render_urls, organization_id")
        .not("render_urls", "is", null)
        .limit(100);

      if (rErr) {
        console.error("[backfill-content-tags] approveflow_3d error:", rErr);
      } else if (renders) {
        for (const render of renders) {
          const urls = render.render_urls || {};
          const views = Object.entries(urls);

          for (const [viewName, viewUrl] of views) {
            if (!viewUrl || typeof viewUrl !== "string") continue;
            const sourceId = `${render.id}_${viewName}`;

            if (await alreadyExists("render", sourceId)) {
              stats.skipped++;
              continue;
            }

            if (!dryRun) {
              const { error: insErr } = await supabase.from("content_files").insert({
                file_type: "image",
                file_url: viewUrl as string,
                source: "render",
                source_id: sourceId,
                brand: "wpw",
                organization_id: render.organization_id,
                tags: ["render", "3d", "approveflow", viewName, "backfill"],
                content_category: "render_3d",
                processing_status: "ready",
                metadata: { approveflow_3d_id: render.id, view: viewName, order_id: render.order_id },
              });
              if (insErr) {
                stats.errors++;
              } else {
                stats.renders++;
              }
            } else {
              stats.renders++;
            }
          }
        }
      }
    }

    // 3. Completed Content Queue items
    if (source === "all" || source === "queue") {
      console.log("[backfill-content-tags] Scanning content_queue (completed)...");

      const { data: queueItems, error: qErr } = await supabase
        .from("content_queue")
        .select("id, output_url, content_type, title, organization_id, brand, platform")
        .eq("status", "completed")
        .not("output_url", "is", null)
        .limit(200);

      if (qErr) {
        console.error("[backfill-content-tags] content_queue error:", qErr);
      } else if (queueItems) {
        for (const item of queueItems) {
          if (!item.output_url) continue;
          if (await alreadyExists("content_queue", item.id)) {
            stats.skipped++;
            continue;
          }

          const isVideo = item.content_type === "reel" || item.content_type === "video";

          if (!dryRun) {
            const { error: insErr } = await supabase.from("content_files").insert({
              file_type: isVideo ? "video" : "image",
              file_url: item.output_url,
              source: "content_queue",
              source_id: item.id,
              brand: item.brand || "wpw",
              organization_id: item.organization_id,
              tags: [item.content_type || "content", "completed", "backfill"].filter(Boolean),
              content_category: item.content_type || "rendered",
              processing_status: "ready",
              original_filename: item.title || undefined,
            });
            if (insErr) {
              stats.errors++;
            } else {
              stats.queue++;
            }
          } else {
            stats.queue++;
          }
        }
      }
    }

    const result = {
      ok: true,
      dry_run: dryRun,
      inserted: stats.portfolio + stats.renders + stats.queue,
      skipped: stats.skipped,
      errors: stats.errors,
      breakdown: {
        portfolio: stats.portfolio,
        renders: stats.renders,
        queue: stats.queue,
      },
    };

    console.log("[backfill-content-tags] Complete:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[backfill-content-tags] Fatal error:", error);
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
