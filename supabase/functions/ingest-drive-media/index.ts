/**
 * ingest-drive-media — Re-host Google-Drive-linked videos into Supabase storage.
 *
 * Why: the Google Drive importer stored raw `drive.google.com/uc?export=download`
 * URLs as content_files.file_url. Browsers cannot stream those in a <video>
 * element (redirect → drive.usercontent.google.com, `content-disposition:
 * attachment`, no media CORS, Drive confirm-page behavior), so the Reel Builder
 * preview is black and the ffmpeg renderer can't download them cleanly.
 *
 * This function downloads each Drive file server-side (they are shared
 * "anyone with the link", so no OAuth is needed) and uploads the bytes to the
 * `media-library` bucket — the same bucket normal uploads use — then rewrites
 * file_url to the public storage URL. The original Drive URL is preserved in
 * metadata.drive_source_url so nothing is lost.
 *
 * Idempotent + batched: only touches rows whose file_url still points at Google
 * Drive, processes a small batch per call (memory-safe under the worker limit),
 * and returns `remaining` so the caller can loop until it hits zero.
 *
 * POST body (all optional):
 *   { batch?: number (default 3, max 5), max_bytes?: number (default 95MB) }
 *
 * Response: { processed, ingested, skipped, failed, remaining, details[] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const BUCKET = "media-library";
const DEFAULT_BATCH = 3;
const MAX_BATCH = 5;
const DEFAULT_MAX_BYTES = 95 * 1024 * 1024; // 95MB — keep well under worker memory

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extFromContentType(ct: string | null, filename: string | null): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-msvideo": "avi",
    "video/x-matroska": "mkv",
  };
  if (ct && map[ct.split(";")[0].trim()]) return map[ct.split(";")[0].trim()];
  const m = filename?.match(/\.([a-z0-9]{2,4})$/i);
  if (m) return m[1].toLowerCase();
  return "mp4";
}

/**
 * Build a direct, server-downloadable URL for a Google Drive share/download link.
 * Drive's `uc?export=download` returns an HTML virus-scan confirm page for larger
 * files; `drive.usercontent.google.com/download?...&confirm=t` streams the bytes
 * directly. If we can't find a file id we return the original URL unchanged.
 */
function driveDirectUrl(url: string): string {
  const id =
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ||
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
    null;
  if (!id) return url;
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

function contentTypeForExt(ext: string): string {
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
  };
  return map[ext] ?? "video/mp4";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let body: { batch?: number; max_bytes?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — use defaults
  }
  const batch = Math.min(Math.max(1, body.batch ?? DEFAULT_BATCH), MAX_BATCH);
  const maxBytes = body.max_bytes ?? DEFAULT_MAX_BYTES;

  // How many Drive-linked videos remain to attempt (excludes rows already
  // flagged as un-ingestable, so the caller's loop terminates).
  const { count: remainingBefore } = await db
    .from("content_files")
    .select("id", { count: "exact", head: true })
    .eq("file_type", "video")
    .ilike("file_url", "%drive.google.com%")
    .filter("metadata->>ingest_status", "is", null);

  // Only consider rows that still point at Drive AND haven't already been
  // attempted-and-flagged. Without the flag filter the oldest stuck files
  // (too large for edge memory) would be re-fetched first on every call and
  // the loop would never reach the good clips.
  const { data: rows, error } = await db
    .from("content_files")
    .select("id, file_url, original_filename, metadata")
    .eq("file_type", "video")
    .ilike("file_url", "%drive.google.com%")
    .filter("metadata->>ingest_status", "is", null)
    .order("created_at", { ascending: true })
    .limit(batch);

  if (error) return json({ error: "query failed", detail: error.message }, 500);
  if (!rows || rows.length === 0) {
    return json({ processed: 0, ingested: 0, skipped: 0, failed: 0, remaining: 0, details: [] });
  }

  const details: Array<Record<string, unknown>> = [];
  let ingested = 0, skipped = 0, failed = 0;

  // Stamp a permanent status on a row we could NOT ingest, so future runs skip
  // it. file_url is left untouched (still the Drive link) so it can be handled
  // by a large-file path later.
  const flag = async (row: Record<string, unknown>, status: string, extra: Record<string, unknown> = {}) => {
    const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
    await db
      .from("content_files")
      .update({ metadata: { ...meta, ingest_status: status, ...extra } })
      .eq("id", row.id as string);
  };

  for (const row of rows) {
    const srcUrl = row.file_url as string;
    try {
      const res = await fetch(driveDirectUrl(srcUrl), { redirect: "follow" });
      if (!res.ok) {
        failed++; details.push({ id: row.id, status: "fetch_failed", http: res.status });
        await flag(row, "fetch_failed", { http: res.status });
        continue;
      }
      const ct = res.headers.get("content-type");
      // Drive returns text/html when it wants a confirm click (large/quota'd files).
      if (ct && ct.includes("text/html")) {
        skipped++; details.push({ id: row.id, status: "drive_interstitial" });
        await flag(row, "drive_interstitial");
        continue;
      }
      const len = Number(res.headers.get("content-length") || "0");
      if (len && len > maxBytes) {
        skipped++; details.push({ id: row.id, status: "too_large", bytes: len });
        await flag(row, "too_large", { bytes: len });
        continue;
      }

      // Prefer the Drive-provided filename for a nice extension.
      const cd = res.headers.get("content-disposition") || "";
      const cdName = cd.match(/filename="?([^"]+)"?/)?.[1] || null;
      const ext = extFromContentType(ct, cdName || (row.original_filename as string));

      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        skipped++; details.push({ id: row.id, status: "too_large", bytes: buf.byteLength });
        await flag(row, "too_large", { bytes: buf.byteLength });
        continue;
      }

      const objectPath = `ingested/${row.id}.${ext}`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(objectPath, buf, {
          contentType: contentTypeForExt(ext),
          upsert: true,
        });
      if (upErr) {
        failed++; details.push({ id: row.id, status: "upload_failed", detail: upErr.message });
        await flag(row, "upload_failed", { detail: upErr.message.slice(0, 200) });
        continue;
      }

      const { data: pub } = db.storage.from(BUCKET).getPublicUrl(objectPath);
      const publicUrl = pub.publicUrl;

      const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
      const { error: updErr } = await db
        .from("content_files")
        .update({
          file_url: publicUrl,
          source: "drive-ingested",
          metadata: { ...meta, drive_source_url: srcUrl, ingested_at: new Date().toISOString() },
        })
        .eq("id", row.id);
      if (updErr) {
        failed++; details.push({ id: row.id, status: "db_update_failed", detail: updErr.message });
        await flag(row, "db_update_failed", { detail: updErr.message.slice(0, 200) });
        continue;
      }

      ingested++;
      details.push({ id: row.id, status: "ingested", url: publicUrl, bytes: buf.byteLength, ext });
    } catch (e) {
      failed++;
      details.push({ id: row.id, status: "error", detail: String(e).slice(0, 200) });
      await flag(row, "error", { detail: String(e).slice(0, 200) });
    }
  }

  return json({
    processed: rows.length,
    ingested,
    skipped,
    failed,
    // Every processed row is now either ingested (file_url rewritten) or
    // flagged (ingest_status set), so all drop out of the next query.
    remaining: Math.max(0, (remainingBefore ?? rows.length) - rows.length),
    details,
  });
});
