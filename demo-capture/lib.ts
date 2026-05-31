// Shared helpers for the demo-capture recorder and discovery tools.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Capture resolution. High-res source is the #1 fix for "wide UI / tiny text":
// a crisp 1080p capture survives a 2x auto-zoom and still looks sharp.
export const VIEWPORT = { width: 1920, height: 1080 };

export interface RecipeStep {
  action: "goto" | "click" | "fill" | "press" | "hover" | "wait" | "waitForSelector" | "scrollIntoView";
  // For navigation
  path?: string;            // appended to DEMO_BASE_URL, e.g. "/restyle"
  // For element actions
  selector?: string;        // CSS or text= selector
  value?: string;           // for fill / press
  ms?: number;              // for wait
  // Storyboard metadata (drives narration + zoom emphasis)
  scene?: string;           // storyboard scene id this step belongs to
  zoom?: number;            // desired zoom level when this step is the focus (e.g. 1.6). Renderer uses it.
  note?: string;            // human note
}

export interface Recipe {
  name: string;
  description?: string;
  // Optional login flow run before steps (uses DEMO_USERNAME / DEMO_PASSWORD)
  login?: { path: string; userSelector: string; passSelector: string; submitSelector: string; waitForSelector?: string };
  steps: RecipeStep[];
}

// A single auto-zoom keyframe: at time `t` ms into the recording, the focal point
// is (x, y) with the given zoom. The renderer interpolates between these.
export interface ZoomKeyframe {
  t: number;       // ms from recording start
  x: number;       // px (in VIEWPORT space)
  y: number;       // px
  w: number;       // focus element width
  h: number;       // focus element height
  zoom: number;    // suggested zoom
  scene?: string;
  label?: string;
}

export function loadRecipe(name: string): Recipe {
  const path = new URL(`./recipes/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Recipe;
}

export function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function baseUrl(): string {
  const u = process.env.DEMO_BASE_URL;
  if (!u) throw new Error("DEMO_BASE_URL not set");
  return u.replace(/\/$/, "");
}

// Upload a local file to the public media-library bucket; returns its public URL.
export async function uploadToStorage(localPath: string, destPath: string, contentType: string): Promise<string> {
  const bytes = readFileSync(localPath);
  const sb = supa();
  const { error } = await sb.storage.from("media-library").upload(destPath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  const { data } = sb.storage.from("media-library").getPublicUrl(destPath);
  return data.publicUrl;
}
