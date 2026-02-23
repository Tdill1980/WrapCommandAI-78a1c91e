// ============================================
// Process WooCommerce Resync — ApproveFlow
// ============================================
// This function processes order data fetched via woo-proxy
// from the frontend, avoiding Cloudflare blocking issues
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// EPO Parser Utilities
// ============================================

const EPO_KEYS = new Set(["_tmcartepo_data", "_tmpost_data", "_tmdata"]);

// Placeholders to treat as empty (force overwrite)
const EMPTY_PLACEHOLDERS = new Set([
  "",
  "n/a",
  "none",
  "—",
  "-",
  "no instructions were provided at checkout.",
  "no instructions provided",
]);

function isEmptyOrPlaceholder(s: string | null | undefined): boolean {
  if (!s) return true;
  const normalized = s.trim().toLowerCase();
  return EMPTY_PLACEHOLDERS.has(normalized) || normalized.length === 0;
}

function safeJsonPreview(v: any, n = 4000): string {
  try {
    return JSON.stringify(v).slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
}

function tryParseJsonString(s: string): any | null {
  const t = s.trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function extractUrlsFromString(s: string): string[] {
  const re = /https?:\/\/[^\s"'<>]+/g;
  return (s.match(re) || []).map((u) => u.replace(/[)\]"',.]+$/, ""));
}

function firstNonEmpty(...vals: any[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// Generic recursive walker for fallback extraction
function walk(
  v: any,
  out: { urls: Set<string>; texts: string[] },
  depth = 0
): void {
  if (depth > 8 || v == null) return;
  if (typeof v === "string") {
    extractUrlsFromString(v).forEach((u) => out.urls.add(u));
    const s = v.trim();
    if (s.length >= 30 && !s.startsWith("http")) out.texts.push(s);
    const parsed = tryParseJsonString(s);
    if (parsed) walk(parsed, out, depth + 1);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x) => walk(x, out, depth + 1));
    return;
  }
  if (typeof v === "object") {
    Object.values(v).forEach((x) => walk(x, out, depth + 1));
    return;
  }
}

// Parse EPO container (_tmcartepo_data, etc.)
function parseEpoContainer(value: any): {
  urls: Set<string>;
  instructionParts: string[];
  vehicleInfo: { year?: string; make?: string; model?: string };
} {
  const out = {
    urls: new Set<string>(),
    instructionParts: [] as string[],
    vehicleInfo: {} as { year?: string; make?: string; model?: string },
  };

  // Handle stringified JSON
  const parsed =
    typeof value === "string" ? tryParseJsonString(value) ?? value : value;

  console.log(
    `[EPO Parser] Parsed type: ${typeof parsed}, isArray: ${Array.isArray(parsed)}`
  );

  if (Array.isArray(parsed)) {
    console.log(`[EPO Parser] Processing ${parsed.length} entries`);

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      if (!entry || typeof entry !== "object") continue;

      // Log entry keys for debugging (first 3 entries)
      if (i < 3) {
        console.log(
          `[EPO Parser] Entry ${i} keys: ${Object.keys(entry).join(", ")}`
        );
      }

      // Extract label and answer
      const label = firstNonEmpty(
        entry.name,
        entry.label,
        entry.title,
        entry.section,
        entry.header,
        entry.field_label
      );
      const answer = firstNonEmpty(
        entry.value_raw,
        entry.value,
        entry.display_value,
        entry.text,
        entry.user_value
      );

      console.log(
        `[EPO Parser] Entry ${i}: label="${label.substring(0, 50)}", answer="${answer.substring(0, 80)}..."`
      );

      // Extract URLs from known URL fields
      const urlFields = [
        "url",
        "uploaded_url",
        "file_url",
        "attachment",
        "file",
      ];
      for (const k of urlFields) {
        const vv = entry[k];
        if (typeof vv === "string") {
          extractUrlsFromString(vv).forEach((u) => out.urls.add(u));
        }
      }

      // Walk entry to catch nested urls/text
      const w = { urls: new Set<string>(), texts: [] as string[] };
      walk(entry, w);
      w.urls.forEach((u) => out.urls.add(u));

      // Determine if this is instruction content
      const labelLower = label.toLowerCase();
      const labelHit =
        /describe|instruction|notes|project|design|brief|details|wrap|required|information|please|color|style|brand/i.test(
          labelLower
        );
      const answerHit = answer.length >= 30;

      // Skip short toggles (Yes, No, N/A) and prices
      const isToggle = /^(yes|no|n\/a|na)$/i.test(answer);
      const isPrice = /^\$?\d+(\.\d{2})?$/.test(answer);
      const isInternalId = /^(tmcp_|_tm|tc_|\d{6,})/.test(answer);

      if ((labelHit || answerHit) && !isToggle && !isPrice && !isInternalId) {
        const block = label
          ? `${label}\n${answer || w.texts[0] || ""}`
          : answer || w.texts[0] || "";
        if (block.trim() && block.trim().length > 10) {
          out.instructionParts.push(block.trim());
          console.log(
            `[EPO Parser] Added instruction block (${block.length} chars)`
          );
        }
      }

      // Extract vehicle info from entry
      if (
        /year/i.test(label) ||
        /vehicle.*year/i.test(label) ||
        entry.element_type === "year"
      ) {
        const yearMatch = answer.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) out.vehicleInfo.year = yearMatch[0];
      }
      if (
        /\bmake\b/i.test(label) ||
        /vehicle.*make/i.test(label) ||
        entry.element_type === "make"
      ) {
        if (answer.length > 1 && answer.length < 50 && !isToggle) {
          out.vehicleInfo.make = answer;
        }
      }
      if (
        /\bmodel\b/i.test(label) ||
        /vehicle.*model/i.test(label) ||
        entry.element_type === "model"
      ) {
        if (answer.length > 1 && answer.length < 100 && !isToggle) {
          out.vehicleInfo.model = answer;
        }
      }
    }
  } else if (typeof parsed === "object" && parsed !== null) {
    // Fallback: walk arbitrary structure
    console.log("[EPO Parser] Falling back to recursive walk");
    const w = { urls: new Set<string>(), texts: [] as string[] };
    walk(parsed, w);
    w.urls.forEach((u) => out.urls.add(u));
    out.instructionParts.push(...w.texts.slice(0, 50)); // Cap at 50 texts
  } else if (typeof parsed === "string" && parsed.length >= 30) {
    // Plain string fallback
    out.instructionParts.push(parsed);
    extractUrlsFromString(parsed).forEach((u) => out.urls.add(u));
  }

  return out;
}

// Normalize URL for deduplication
function normalizeUrl(url: string): string {
  return url.trim().replace(/&amp;/g, "&").replace(/[)\]"',.]+$/, "");
}

// ============================================
// Main Handler
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, orderData, force = false } = await req.json();

    if (!projectId || !orderData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing projectId or orderData",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[ProcessResync] Processing order for projectId: ${projectId}, force=${force}`
    );

    const SUPABASE_URL = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current project state
    const { data: project, error: projectErr } = await supabase
      .from("approveflow_projects")
      .select("order_number, design_instructions, vehicle_info")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      console.error("[ProcessResync] Project not found", projectErr);
      return new Response(
        JSON.stringify({ success: false, error: "Project not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const order = orderData;
    console.log(
      `[ProcessResync] Processing order #${order.number || project.order_number} with ${order.line_items?.length || 0} line items`
    );

    // Collected data
    const instructionParts: string[] = [];
    const fileUrls: Set<string> = new Set();
    let vehicleInfo: { year?: string; make?: string; model?: string } = {};
    const metaContainersSeen: string[] = [];
    const keysSeenSample: string[] = [];

    // Iterate through all line items and their meta_data
    for (const item of order.line_items || []) {
      console.log(`[ProcessResync] Processing line item: ${item.name}`);

      for (const meta of item.meta_data || []) {
        const key = meta.key || "";
        const keyLower = key.toLowerCase();
        const displayKey = meta.display_key || meta.key || "";
        const value = meta.value;

        // Track keys for debugging
        if (keysSeenSample.length < 20 && !keysSeenSample.includes(key)) {
          keysSeenSample.push(key);
        }

        // ============================================
        // EPO Container Handling (CRITICAL FIX)
        // ============================================
        if (EPO_KEYS.has(key)) {
          metaContainersSeen.push(key);
          console.log(`[ProcessResync] Found EPO container: ${key}`);
          console.log(
            `[ProcessResync] EPO value type: ${typeof value}, isArray: ${Array.isArray(value)}`
          );
          console.log(
            `[ProcessResync] EPO preview: ${safeJsonPreview(value, 2000)}`
          );

          // Parse EPO container
          const epoResult = parseEpoContainer(value);

          console.log(
            `[ProcessResync] EPO parsed: ${epoResult.instructionParts.length} instructions, ${epoResult.urls.size} URLs`
          );

          // Merge results
          epoResult.instructionParts.forEach((p) => instructionParts.push(p));
          epoResult.urls.forEach((u) => fileUrls.add(normalizeUrl(u)));
          if (epoResult.vehicleInfo.year && !vehicleInfo.year)
            vehicleInfo.year = epoResult.vehicleInfo.year;
          if (epoResult.vehicleInfo.make && !vehicleInfo.make)
            vehicleInfo.make = epoResult.vehicleInfo.make;
          if (epoResult.vehicleInfo.model && !vehicleInfo.model)
            vehicleInfo.model = epoResult.vehicleInfo.model;

          continue; // EPO handled, skip normal processing
        }

        // Skip other internal WooCommerce fields
        if (keyLower.startsWith("_") || keyLower.startsWith("pa_")) continue;

        // ============================================
        // Standard meta_data handling (non-EPO)
        // ============================================
        const valueStr = String(value ?? "");

        // Design instructions from standard fields
        const isInstructionField =
          keyLower.includes("describe") ||
          keyLower.includes("design") ||
          keyLower.includes("project") ||
          keyLower.includes("instructions") ||
          keyLower.includes("notes") ||
          keyLower.includes("details") ||
          keyLower.includes("requirements") ||
          keyLower.includes("information") ||
          keyLower.includes("please") ||
          displayKey.toLowerCase().includes("describe") ||
          displayKey.toLowerCase().includes("project") ||
          displayKey.toLowerCase().includes("information");

        const isLongCustomerText =
          valueStr.length > 50 &&
          valueStr.includes(" ") &&
          !valueStr.startsWith("http");

        if (isInstructionField || isLongCustomerText) {
          if (valueStr.length > 10) {
            instructionParts.push(valueStr);
            console.log(
              `[ProcessResync] Found instruction from standard meta (${valueStr.length} chars)`
            );
          }
        }

        // File uploads from standard fields
        if (
          keyLower.includes("file") ||
          keyLower.includes("upload") ||
          keyLower.includes("logo") ||
          keyLower.includes("artwork")
        ) {
          extractUrlsFromString(valueStr).forEach((u) =>
            fileUrls.add(normalizeUrl(u))
          );
        }

        // Vehicle info from standard fields
        if (
          keyLower.includes("year") ||
          displayKey.toLowerCase().includes("year")
        ) {
          const yearMatch = valueStr.match(/\b(19|20)\d{2}\b/);
          if (yearMatch && !vehicleInfo.year) vehicleInfo.year = yearMatch[0];
        }
        if (
          keyLower.includes("make") ||
          displayKey.toLowerCase().includes("make")
        ) {
          if (valueStr.length > 1 && valueStr.length < 50 && !vehicleInfo.make) {
            vehicleInfo.make = valueStr;
          }
        }
        if (
          keyLower.includes("model") ||
          displayKey.toLowerCase().includes("model")
        ) {
          if (
            valueStr.length > 1 &&
            valueStr.length < 100 &&
            !vehicleInfo.model
          ) {
            vehicleInfo.model = valueStr;
          }
        }
      }
    }

    // Also check order-level meta_data for vehicle info
    for (const meta of order.meta_data || []) {
      const key = (meta.key || "").toLowerCase();
      const value = meta.value || "";

      if (key.includes("year")) {
        const yearMatch = String(value).match(/\b(19|20)\d{2}\b/);
        if (yearMatch && !vehicleInfo.year) vehicleInfo.year = yearMatch[0];
      }
      if (key.includes("make") && !vehicleInfo.make) {
        if (typeof value === "string" && value.length > 1 && value.length < 50) {
          vehicleInfo.make = value;
        }
      }
      if (key.includes("model") && !vehicleInfo.model) {
        if (
          typeof value === "string" &&
          value.length > 1 &&
          value.length < 100
        ) {
          vehicleInfo.model = value;
        }
      }
    }

    // Dedupe instruction parts
    const uniqueInstructions = [...new Set(instructionParts)];
    const designInstructions = uniqueInstructions.join("\n\n");

    console.log(
      `[ProcessResync] Final extracted: ${uniqueInstructions.length} instruction blocks (${designInstructions.length} chars), ${fileUrls.size} files, vehicle=${JSON.stringify(vehicleInfo)}`
    );
    console.log(
      `[ProcessResync] Meta containers seen: ${metaContainersSeen.join(", ") || "none"}`
    );
    console.log(`[ProcessResync] Keys sample: ${keysSeenSample.join(", ")}`);

    // Track what was synced
    const synced = {
      designInstructions: false,
      instructionPartsFound: uniqueInstructions.length,
      instructionChars: designInstructions.length,
      vehicleInfo: null as { year?: string; make?: string; model?: string } | null,
      filesDetected: fileUrls.size,
      filesInserted: 0,
      metaContainersSeen,
      keysSeenSample,
    };

    // Update approveflow_projects
    const updates: Record<string, any> = {};

    // Check if we should update instructions
    const existingInstructionsEmpty = isEmptyOrPlaceholder(
      project.design_instructions
    );
    const shouldUpdateInstructions =
      designInstructions.length > 0 && (force || existingInstructionsEmpty);

    if (shouldUpdateInstructions) {
      updates.design_instructions = designInstructions;
      synced.designInstructions = true;
      console.log(
        `[ProcessResync] Will update instructions (force=${force}, existingEmpty=${existingInstructionsEmpty})`
      );
    }

    // Vehicle info handling
    const existingVehicle = (project.vehicle_info as any) || {};
    if (Object.keys(vehicleInfo).length > 0) {
      const mergedVehicle = {
        year: vehicleInfo.year || existingVehicle.year,
        make: vehicleInfo.make || existingVehicle.make,
        model: vehicleInfo.model || existingVehicle.model,
      };

      const hasNewVehicleData =
        (vehicleInfo.year && !existingVehicle.year) ||
        (vehicleInfo.make && !existingVehicle.make) ||
        (vehicleInfo.model && !existingVehicle.model);

      if (hasNewVehicleData || force) {
        updates.vehicle_info = mergedVehicle;
        synced.vehicleInfo = vehicleInfo;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from("approveflow_projects")
        .update(updates)
        .eq("id", projectId);

      if (updateErr) {
        console.error("[ProcessResync] Failed to update project", updateErr);
      } else {
        console.log("[ProcessResync] Updated project with:", Object.keys(updates));
      }
    }

    // Insert new assets (with deduplication)
    for (const url of fileUrls) {
      const { data: existing } = await supabase
        .from("approveflow_assets")
        .select("id")
        .eq("project_id", projectId)
        .eq("file_url", url)
        .maybeSingle();

      if (existing) {
        console.log(`[ProcessResync] Asset already exists: ${url.substring(0, 60)}...`);
        continue;
      }

      // Determine file type from URL
      const filename = url.split("/").pop()?.split("?")[0] || "customer_file";
      const extension = filename.split(".").pop()?.toLowerCase() || "";

      let fileType = "customer_upload";
      if (["ai", "eps", "pdf", "psd"].includes(extension)) {
        fileType = "customer_design_file";
      } else if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
        fileType = "customer_reference";
      }

      const { error: insertErr } = await supabase
        .from("approveflow_assets")
        .insert({
          project_id: projectId,
          file_url: url,
          file_type: fileType,
          original_filename: filename,
          source: "woocommerce",
          visibility: "internal",
        });

      if (insertErr) {
        console.error(
          `[ProcessResync] Failed to insert asset: ${filename}`,
          insertErr
        );
      } else {
        synced.filesInserted++;
        console.log(`[ProcessResync] Inserted asset: ${filename}`);
      }
    }

    // Build summary message
    const parts: string[] = [];
    if (synced.filesInserted > 0) {
      parts.push(
        `${synced.filesInserted} file${synced.filesInserted > 1 ? "s" : ""}`
      );
    }
    if (synced.designInstructions) {
      parts.push(`instructions (${synced.instructionChars} chars)`);
    }
    if (synced.vehicleInfo) parts.push("vehicle info");

    const message =
      parts.length > 0
        ? `Synced: ${parts.join(", ")}`
        : synced.instructionPartsFound > 0
          ? `Detected ${synced.instructionPartsFound} instruction blocks (${synced.instructionChars} chars) but project already has instructions. Use force=true to overwrite.`
          : "No new data found to sync";

    console.log(`[ProcessResync] Complete: ${message}`);

    return new Response(
      JSON.stringify({
        success: true,
        orderNumber: order.number || project.order_number,
        synced,
        message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[ProcessResync] Error:", error);
    // Return 200 with error payload so Supabase client passes through the actual error
    // instead of generic "Edge Function returned a non-2xx status code".
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
