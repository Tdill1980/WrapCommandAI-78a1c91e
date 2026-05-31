// discover.ts
// One-time mapping pass: opens the app (optionally logging in) and dumps every
// interactive element on the page -- text, role, a best-effort stable selector,
// and bounding box -- plus a full-page screenshot. Use this to AUTHOR recipes
// against real selectors instead of guessing.
//
// Run with MODE=discover (CI) or `npm run discover` locally.
// Env: DEMO_BASE_URL, DEMO_USERNAME, DEMO_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Optional: set DISCOVER_PATH to map a specific page (default "/").

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VIEWPORT, baseUrl, uploadToStorage } from "./lib.ts";

const OUT = "out";
mkdirSync(OUT, { recursive: true });
const BASE = baseUrl();
const target = process.env.DISCOVER_PATH || "/";

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();

  // Best-effort generic login (override selectors via env if needed)
  if (process.env.DEMO_USERNAME && process.env.LOGIN_PATH) {
    await page.goto(BASE + process.env.LOGIN_PATH, { waitUntil: "domcontentloaded" });
    await page.fill(process.env.LOGIN_USER_SEL || 'input[type="email"]', process.env.DEMO_USERNAME);
    await page.fill(process.env.LOGIN_PASS_SEL || 'input[type="password"]', process.env.DEMO_PASSWORD || "");
    await page.click(process.env.LOGIN_SUBMIT_SEL || 'button[type="submit"]');
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  await page.goto(BASE + (target.startsWith("/") ? target : "/" + target), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  // Extract interactive elements with a best-effort stable selector.
  const elements = await page.evaluate(() => {
    const sel = (el: Element): string => {
      const t = el as HTMLElement;
      if (t.getAttribute("data-testid")) return `[data-testid="${t.getAttribute("data-testid")}"]`;
      if (t.id) return `#${CSS.escape(t.id)}`;
      if (t.getAttribute("name")) return `${t.tagName.toLowerCase()}[name="${t.getAttribute("name")}"]`;
      const aria = t.getAttribute("aria-label");
      if (aria) return `${t.tagName.toLowerCase()}[aria-label="${aria}"]`;
      const txt = (t.textContent || "").trim().slice(0, 40);
      if (txt) return `text=${txt}`;
      return t.tagName.toLowerCase();
    };
    const nodes = Array.from(
      document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="tab"], [onclick]')
    );
    return nodes.slice(0, 400).map((el) => {
      const r = el.getBoundingClientRect();
      const t = el as HTMLElement;
      return {
        tag: t.tagName.toLowerCase(),
        role: t.getAttribute("role") || undefined,
        type: t.getAttribute("type") || undefined,
        text: (t.textContent || "").trim().slice(0, 60),
        placeholder: t.getAttribute("placeholder") || undefined,
        selector: sel(el),
        visible: r.width > 0 && r.height > 0,
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    }).filter((e) => e.visible);
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const elemLocal = join(OUT, "elements.json");
  const shotLocal = join(OUT, "page.png");
  writeFileSync(elemLocal, JSON.stringify({ base: BASE, path: target, count: elements.length, elements }, null, 2));
  await page.screenshot({ path: shotLocal, fullPage: true });

  await context.close();
  await browser.close();

  const elemUrl = await uploadToStorage(elemLocal, `discovery/${stamp}-elements.json`, "application/json");
  const shotUrl = await uploadToStorage(shotLocal, `discovery/${stamp}-page.png`, "image/png");

  console.log(JSON.stringify({
    ok: true, path: target, elements: elements.length,
    elements_url: elemUrl, screenshot_url: shotUrl,
    hint: "Use these selectors to fill in a recipe under recipes/. Prefer [data-testid]; if few exist, add them to the app for durable scripts.",
  }, null, 2));
};

run().catch((e) => { console.error(e); process.exit(1); });
