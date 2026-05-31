// recorder.ts
// Runs a recipe against the live app, records a high-res video, and logs an
// auto-zoom keyframe track (focal point + zoom per click) as a sidecar JSON.
// Both are uploaded to Supabase storage (media-library/demos/...).
//
// The zoom track is what makes the wide UI readable: render-reel can apply
// scale+position keyframes in Creatomate so the video zooms to each click.
//
// Env: DEMO_BASE_URL, DEMO_USERNAME, DEMO_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RECIPE

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { VIEWPORT, loadRecipe, baseUrl, uploadToStorage, type ZoomKeyframe, type RecipeStep } from "./lib.ts";

const OUT = "out";
mkdirSync(OUT, { recursive: true });

const recipeName = process.env.RECIPE || "restyle-color-change";
const recipe = loadRecipe(recipeName);
const BASE = baseUrl();

function abs(path?: string) {
  if (!path) return BASE;
  return path.startsWith("http") ? path : BASE + (path.startsWith("/") ? path : "/" + path);
}

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // retina-crisp text
    recordVideo: { dir: OUT, size: VIEWPORT },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const zoom: ZoomKeyframe[] = [];

  const recordFocus = async (step: RecipeStep, label: string) => {
    if (!step.selector) return;
    try {
      const el = page.locator(step.selector).first();
      const box = await el.boundingBox();
      if (box) {
        zoom.push({
          t: Date.now() - t0,
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
          w: Math.round(box.width),
          h: Math.round(box.height),
          zoom: step.zoom ?? 1.6,
          scene: step.scene,
          label,
        });
      }
    } catch { /* element not found for focus capture; skip */ }
  };

  // Optional login
  if (recipe.login) {
    const l = recipe.login;
    await page.goto(abs(l.path), { waitUntil: "domcontentloaded" });
    if (process.env.DEMO_USERNAME) await page.fill(l.userSelector, process.env.DEMO_USERNAME);
    if (process.env.DEMO_PASSWORD) await page.fill(l.passSelector, process.env.DEMO_PASSWORD);
    await page.click(l.submitSelector);
    if (l.waitForSelector) await page.waitForSelector(l.waitForSelector, { timeout: 30000 });
    else await page.waitForLoadState("networkidle").catch(() => {});
  }

  // Steps
  for (const step of recipe.steps) {
    try {
      switch (step.action) {
        case "goto":
          await page.goto(abs(step.path), { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle").catch(() => {});
          break;
        case "click":
          await recordFocus(step, "click");
          await page.locator(step.selector!).first().click({ timeout: 15000 });
          break;
        case "fill":
          await recordFocus(step, "fill");
          await page.locator(step.selector!).first().fill(step.value ?? "");
          break;
        case "press":
          await page.locator(step.selector!).first().press(step.value ?? "Enter");
          break;
        case "hover":
          await recordFocus(step, "hover");
          await page.locator(step.selector!).first().hover();
          break;
        case "scrollIntoView":
          await page.locator(step.selector!).first().scrollIntoViewIfNeeded();
          await recordFocus(step, "scroll");
          break;
        case "waitForSelector":
          await page.waitForSelector(step.selector!, { timeout: step.ms ?? 30000 });
          await recordFocus(step, "reveal");
          break;
        case "wait":
          await page.waitForTimeout(step.ms ?? 1000);
          break;
      }
      // small settle so the camera (zoom) reads as deliberate, not jumpy
      await page.waitForTimeout(400);
    } catch (e) {
      console.error(`[recorder] step failed (${step.action} ${step.selector ?? step.path ?? ""}):`, e);
    }
  }

  await page.waitForTimeout(800);
  await context.close(); // finalizes the video file
  await browser.close();

  // Find the recorded video
  const video = readdirSync(OUT).find((f) => f.endsWith(".webm"));
  if (!video) throw new Error("No video produced");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const videoDest = `demos/${recipeName}/${stamp}.webm`;
  const trackDest = `demos/${recipeName}/${stamp}.zoom.json`;

  const trackLocal = join(OUT, "zoom-track.json");
  writeFileSync(trackLocal, JSON.stringify({ recipe: recipeName, viewport: VIEWPORT, keyframes: zoom }, null, 2));

  const videoUrl = await uploadToStorage(join(OUT, video), videoDest, "video/webm");
  const trackUrl = await uploadToStorage(trackLocal, trackDest, "application/json");

  console.log(JSON.stringify({
    ok: true,
    recipe: recipeName,
    video_url: videoUrl,
    zoom_track_url: trackUrl,
    keyframes: zoom.length,
    note: "webm capture; convert to mp4 (ffmpeg/Mux) before Creatomate compositing.",
  }, null, 2));
};

run().catch((e) => { console.error(e); process.exit(1); });
