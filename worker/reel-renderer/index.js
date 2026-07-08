/**
 * reel-renderer — self-hosted ffmpeg reel renderer (replaces Creatomate).
 *
 * Runs as a small always-on service (Railway/Render/Fly). It:
 *   1. Polls reel_render_jobs for status='queued' (and accepts a /kick to
 *      poll immediately).
 *   2. Claims a job, renders it with ffmpeg, uploads the mp4 to Supabase
 *      Storage, and writes final_render_url back to video_edit_queue — the
 *      SAME contract the old Creatomate render-reel used, so the UI is
 *      unchanged.
 *
 * v1 scope (single-clip reel — the reliable base):
 *   - Take the first scene's clip, trim [start,end], scale + center-crop to
 *     the target aspect (default 1080x1920 / 9:16).
 *   - Burn the scene text overlay + timed captions + end card via drawtext.
 *   - Mix background music with a fade-out.
 * Multi-scene concat is the clearly-marked next step (see renderReel()).
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional env:
 *   PORT (default 8080), POLL_INTERVAL_MS (default 5000),
 *   RENDER_WORKER_KEY (shared secret required on /kick),
 *   TARGET_W (1080), TARGET_H (1920), FONT_FILE (path to a .ttf)
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = Number(process.env.PORT || 8080);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const WORKER_KEY = process.env.RENDER_WORKER_KEY || "";
const TARGET_W = Number(process.env.TARGET_W || 1080);
const TARGET_H = Number(process.env.TARGET_H || 1920);
const FONT_FILE = process.env.FONT_FILE || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[reel-renderer] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);

let running = false;

// ── ffmpeg helpers ──────────────────────────────────────────────────────────
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

// drawtext-safe escaping (colons, quotes, backslashes, %)
function esc(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

function yForPosition(pos) {
  if (pos === "top") return "h*0.12";
  if (pos === "center") return "(h-text_h)/2";
  return "h*0.78"; // bottom (default)
}

function drawtext({ text, position, start, end, fontsize }) {
  const enable = start != null && end != null ? `:enable='between(t,${start},${end})'` : "";
  return (
    `drawtext=fontfile='${FONT_FILE}':text='${esc(text)}'` +
    `:fontcolor=white:fontsize=${fontsize || 64}:box=1:boxcolor=black@0.55:boxborderw=24` +
    `:x=(w-text_w)/2:y=${yForPosition(position)}${enable}`
  );
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

// ── render one job ───────────────────────────────────────────────────────────
async function renderReel(job) {
  const bp = job.blueprint || {};
  const scenes = bp.scenes || [];
  if (!scenes.length) throw new Error("blueprint has no scenes");

  const work = await mkdtemp(join(tmpdir(), "reel-"));
  try {
    // v1: single-clip — the first scene. (Multi-scene concat: build one
    // trimmed+scaled+cropped segment per scene, then concat the segments
    // with the concat demuxer before applying captions/music. Same tools.)
    const scene = scenes[0];
    const srcUrl = scene.clipUrl || scene.clip_url || scene.source;
    if (!srcUrl) throw new Error("first scene has no clipUrl");

    const srcPath = join(work, "src.mp4");
    await download(srcUrl, srcPath);

    const start = Number(scene.start || 0);
    const end = Number(scene.end || start + 6);
    const dur = Math.max(0.5, end - start);

    // Video filter chain: scale to cover the target, center-crop, then text.
    const filters = [
      `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase`,
      `crop=${TARGET_W}:${TARGET_H}`,
      `setsar=1`,
    ];
    if (scene.text?.trim()) {
      filters.push(drawtext({ text: scene.text, position: scene.textPosition || "bottom", fontsize: 68 }));
    }
    for (const cap of job.captions || []) {
      if (!cap.text?.trim()) continue;
      const cs = Number(cap.time || 0);
      const ce = cs + Math.max(0.3, Number(cap.duration || 2));
      filters.push(drawtext({ text: cap.text, position: cap.position || "bottom", start: cs, end: ce, fontsize: 56 }));
    }
    if (bp.endCard?.text) {
      // End card as a text card over the last endCard.duration seconds.
      const ecStart = Math.max(0, dur - Number(bp.endCard.duration || 2));
      filters.push(drawtext({ text: bp.endCard.text, position: "center", start: ecStart, end: dur, fontsize: 80 }));
      if (bp.endCard.cta) {
        filters.push(drawtext({ text: bp.endCard.cta, position: "bottom", start: ecStart, end: dur, fontsize: 60 }));
      }
    }

    const outPath = join(work, "out.mp4");
    const args = ["-y", "-ss", String(start), "-t", String(dur), "-i", srcPath];

    const hasMusic = job.music_url && /^https?:\/\//i.test(job.music_url);
    if (hasMusic) {
      const musicPath = join(work, "music.m4a");
      await download(job.music_url, musicPath);
      args.push("-i", musicPath);
    }

    args.push("-vf", filters.join(","));
    if (hasMusic) {
      // Use the music track, fade it out at the end, drop original audio.
      args.push("-af", `afade=t=out:st=${Math.max(0, dur - 1)}:d=1`, "-map", "0:v:0", "-map", "1:a:0", "-shortest");
    }
    args.push(
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "128k",
      outPath,
    );
    await run("ffmpeg", args);

    // Thumbnail (first frame)
    const thumbPath = join(work, "thumb.jpg");
    await run("ffmpeg", ["-y", "-i", outPath, "-frames:v", "1", "-q:v", "3", thumbPath]);

    // Upload both to storage
    const bucket = job.bucket || "media-library";
    const base = `reels/${job.id}`;
    const mp4 = await readFile(outPath);
    const thumb = await readFile(thumbPath);
    const up1 = await db.storage.from(bucket).upload(`${base}.mp4`, mp4, { contentType: "video/mp4", upsert: true });
    if (up1.error) throw new Error(`upload mp4: ${up1.error.message}`);
    const up2 = await db.storage.from(bucket).upload(`${base}.jpg`, thumb, { contentType: "image/jpeg", upsert: true });
    if (up2.error) console.warn("[reel-renderer] thumb upload failed:", up2.error.message);

    const finalUrl = db.storage.from(bucket).getPublicUrl(`${base}.mp4`).data.publicUrl;
    const thumbUrl = db.storage.from(bucket).getPublicUrl(`${base}.jpg`).data.publicUrl;
    return { finalUrl, thumbUrl };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// ── job loop ─────────────────────────────────────────────────────────────────
async function claimNext() {
  // Claim the oldest queued job atomically-ish (service role, low concurrency).
  const { data: rows } = await db
    .from("reel_render_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  const job = rows?.[0];
  if (!job) return null;
  const { data: claimed } = await db
    .from("reel_render_jobs")
    .update({ status: "rendering", claimed_at: new Date().toISOString(), attempts: (job.attempts || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "queued") // lost-update guard if two workers race
    .select("*")
    .single();
  return claimed || null;
}

async function processOne() {
  const job = await claimNext();
  if (!job) return false;
  console.log(`[reel-renderer] rendering job ${job.id} (edit_queue ${job.edit_queue_id})`);
  try {
    const { finalUrl, thumbUrl } = await renderReel(job);

    await db.from("reel_render_jobs")
      .update({ status: "complete", final_url: finalUrl, thumbnail_url: thumbUrl, error: null, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    if (job.edit_queue_id) {
      await db.from("video_edit_queue")
        .update({ render_status: "complete", final_render_url: finalUrl, updated_at: new Date().toISOString() })
        .eq("id", job.edit_queue_id);
    }
    if (job.creative_id) {
      await db.from("ai_creatives")
        .update({ status: "complete", output_url: finalUrl, thumbnail_url: thumbUrl })
        .eq("id", job.creative_id);
    }
    console.log(`[reel-renderer] ✅ job ${job.id} → ${finalUrl}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reel-renderer] ❌ job ${job.id}: ${msg}`);
    await db.from("reel_render_jobs")
      .update({ status: "failed", error: msg, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (job.edit_queue_id) {
      await db.from("video_edit_queue")
        .update({ render_status: "failed", error_message: msg })
        .eq("id", job.edit_queue_id);
    }
  }
  return true;
}

async function drain() {
  if (running) return;
  running = true;
  try {
    // process until the queue is empty
    // eslint-disable-next-line no-await-in-loop
    while (await processOne()) { /* keep going */ }
  } finally {
    running = false;
  }
}

// ── http server (health + kick) ──────────────────────────────────────────────
http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, running }));
    return;
  }
  if (req.url === "/kick" && req.method === "POST") {
    if (WORKER_KEY && req.headers["x-worker-key"] !== WORKER_KEY) {
      res.writeHead(401); res.end("unauthorized"); return;
    }
    drain().catch((e) => console.error("[reel-renderer] drain error", e));
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, kicked: true }));
    return;
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => console.log(`[reel-renderer] listening on :${PORT}, polling every ${POLL_MS}ms`));

// polling fallback
setInterval(() => { drain().catch((e) => console.error("[reel-renderer] drain error", e)); }, POLL_MS);
