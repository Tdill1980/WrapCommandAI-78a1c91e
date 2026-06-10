import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seo-cron",
};

/**
 * SEO + AEO Engine
 *
 * Self-contained engine on WrapCommand-Production. Actions:
 *  - generate_blog:   AI-write an answer-engine-optimized article for the next
 *                     queued keyword and publish it to WordPress (wp/v2) when
 *                     WP credentials are saved in seo_settings.
 *  - product_sweep:   Audit WooCommerce products (wc/v3, server secrets) and
 *                     propose SEO title/short-description/meta rewrites.
 *                     Applies them automatically only if auto_apply is on.
 *  - apply_product:   Apply one pending product rewrite by audit id.
 *  - audit:           Site SEO health pass over products + posts.
 *  - gsc_sync:        Pull Search Console metrics (needs GSC_SERVICE_ACCOUNT_JSON
 *                     secret); promotes page-2 queries into the keyword bank.
 *  - status:          Dashboard summary.
 *
 * Called by the /seo-engine page (user JWT) and by pg_cron (x-seo-cron token).
 */

const WOO_BASE = "https://weprintwraps.com/wp-json/wc/v3";

// Money pages the article generator weaves internal links into
const PRODUCT_LINKS = [
  { label: "Avery 1105 printed wrap with DOL 1360 lamination", url: "https://weprintwraps.com/our-products/avery-1105egrs-with-doz13607-lamination/" },
  { label: "3M IJ180 printed wrap film", url: "https://weprintwraps.com/our-products/3m-ij180-printed-wrap-film/" },
  { label: "Avery cut contour vinyl graphics", url: "https://weprintwraps.com/our-products/avery-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/" },
  { label: "3M cut contour vinyl graphics", url: "https://weprintwraps.com/our-products/3m-cut-contour-vinyl-graphics-54-roll-max-artwork-size-50/" },
  { label: "Perforated window vinyl 50/50", url: "https://weprintwraps.com/our-products/perforated-window-vinyl-5050-unlaminated/" },
  { label: "Camo & Carbon wrap by the yard", url: "https://weprintwraps.com/our-products/camo-carbon-wrap-by-the-yard/" },
  { label: "Metal & Marble wrap by the yard", url: "https://weprintwraps.com/our-products/wrap-by-the-yard-metal-marble/" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function db(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function callGemini(system: string, user: string): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return content;
}

function parseAIJson<T>(raw: string): T {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf(cleaned.trimStart()[0] === "[" ? "[" : "{");
  const end = cleaned.lastIndexOf(cleaned.trimStart()[0] === "[" ? "]" : "}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Woo auth, two layers: consumer key/secret in the query string (wc/v3 over
// HTTPS) first, then WordPress application-password Basic auth from
// seo_settings — app passwords are valid for the Woo REST API and cover the
// case where the stored consumer keys are stale or read-restricted.
let wpBasicAuth: string | null = null;

async function loadWpBasicAuth(supabase: SupabaseClient): Promise<string | null> {
  if (wpBasicAuth) return wpBasicAuth;
  const { data } = await supabase.from("seo_settings").select("wp_username, wp_app_password").eq("id", 1).single();
  if (data?.wp_username && data?.wp_app_password) {
    wpBasicAuth = `Basic ${btoa(`${data.wp_username}:${data.wp_app_password}`)}`;
  }
  return wpBasicAuth;
}

async function wooFetch(
  supabase: SupabaseClient,
  path: string,
  params: Record<string, string> = {},
  init: RequestInit = {},
): Promise<Response> {
  const key = Deno.env.get("WOO_CONSUMER_KEY");
  const secret = Deno.env.get("WOO_CONSUMER_SECRET");
  const qs = new URLSearchParams(params);

  let res: Response | null = null;
  if (key && secret) {
    const authedQs = new URLSearchParams({ ...params, consumer_key: key, consumer_secret: secret });
    res = await fetch(`${WOO_BASE}${path}?${authedQs}`, init);
    if (res.status !== 401 && res.status !== 403) return res;
  }

  const basic = await loadWpBasicAuth(supabase);
  if (basic) {
    const headers = { ...(init.headers as Record<string, string> ?? {}), Authorization: basic };
    return await fetch(`${WOO_BASE}${path}?${qs}`, { ...init, headers });
  }
  if (res) return res;
  throw new Error("No WooCommerce credentials available — set WOO_CONSUMER_KEY/SECRET or save a WordPress application password in SEO Engine settings");
}

async function startRun(supabase: SupabaseClient, runType: string) {
  const { data, error } = await supabase
    .from("seo_runs")
    .insert({ run_type: runType, status: "running" })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  status: string,
  stats: Record<string, unknown>,
  error?: string,
) {
  await supabase
    .from("seo_runs")
    .update({ status, stats, error: error ?? null, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

// ---------------------------------------------------------------------------
// Blog generation (SEO + AEO)
// ---------------------------------------------------------------------------

interface GeneratedArticle {
  title: string;
  slug: string;
  meta_title: string;
  meta_description: string;
  html_content: string;
  faq: { question: string; answer: string }[];
}

function buildSchema(article: GeneratedArticle, focusKeyword: string, url: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.meta_title,
        description: article.meta_description,
        keywords: focusKeyword,
        author: { "@type": "Organization", name: "WePrintWraps", url: "https://weprintwraps.com" },
        publisher: { "@type": "Organization", name: "WePrintWraps", url: "https://weprintwraps.com" },
        mainEntityOfPage: url,
        datePublished: new Date().toISOString(),
      },
      {
        "@type": "FAQPage",
        mainEntity: article.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };
}

async function generateArticle(keyword: string, intent: string): Promise<GeneratedArticle> {
  const system = `You are the senior SEO + AEO (answer engine optimization) content engineer for WePrintWraps (weprintwraps.com), a WHOLESALE LARGE-FORMAT PRINT SHOP. We PRINT vehicle wraps, cut contour graphics, perforated window vinyl, and wrap-by-the-yard — we do NOT install. Customers are wrap installers, sign shops, fleet managers, and DIY enthusiasts who order printed material shipped to them.

You write content engineered to win BOTH classic Google rankings AND AI answer engines (Google AI Overviews, ChatGPT, Perplexity):
- The first paragraph is a direct, complete 45-60 word answer to the query (snippet/AI-citation bait).
- H2 headings are phrased as the real questions people ask.
- Every section opens with the answer, then expands.
- Include concrete numbers (prices, sq ft, durability years) wherever honest ranges exist.
- Comparison topics get an HTML table.
- Natural internal links to the provided product URLs (2-4 links, only where genuinely relevant).
- End with a clear CTA to order printed wraps from weprintwraps.com.

Respond with STRICT JSON only.`;

  const user = `Write a 1200-1600 word article targeting the keyword: "${keyword}" (search intent: ${intent}).

Available internal product links:
${PRODUCT_LINKS.map((p) => `- ${p.label}: ${p.url}`).join("\n")}

Return JSON exactly in this shape:
{
  "title": "H1 title containing the keyword naturally",
  "slug": "url-slug-with-keyword",
  "meta_title": "max 60 chars, keyword near the front",
  "meta_description": "140-155 chars, includes keyword + a reason to click",
  "html_content": "article body in clean HTML using only <h2>, <h3>, <p>, <ul>, <li>, <table>, <tr>, <th>, <td>, <a>, <strong> tags. No <h1>, no <html>/<body>, no inline styles.",
  "faq": [ { "question": "...", "answer": "40-55 word direct answer" } ]  // exactly 5 FAQs
}`;

  return parseAIJson<GeneratedArticle>(await callGemini(system, user));
}

async function publishToWordPress(
  settings: { site_url: string; wp_username: string; wp_app_password: string },
  post: { title: string; slug: string; html: string; excerpt: string; metaTitle: string; metaDesc: string; focusKeyword: string },
) {
  const auth = `Basic ${btoa(`${settings.wp_username}:${settings.wp_app_password}`)}`;
  const res = await fetch(`${settings.site_url}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: post.title,
      slug: post.slug,
      content: post.html,
      excerpt: post.excerpt,
      status: "publish",
      // Picked up when Yoast exposes meta over REST; JSON-LD in the body covers schema regardless
      meta: {
        _yoast_wpseo_title: post.metaTitle,
        _yoast_wpseo_metadesc: post.metaDesc,
        _yoast_wpseo_focuskw: post.focusKeyword,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WP publish failed ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return { id: body.id as number, link: body.link as string };
}

async function actionGenerateBlog(supabase: SupabaseClient) {
  const runId = await startRun(supabase, "generate_blog");
  try {
    const { data: settings } = await supabase.from("seo_settings").select("*").eq("id", 1).single();
    if (!settings?.auto_blog_enabled) {
      await finishRun(supabase, runId, "skipped", { reason: "auto_blog_enabled is off" });
      return json({ success: true, skipped: true, reason: "auto_blog_enabled is off" });
    }

    const { data: kw } = await supabase
      .from("seo_keywords")
      .select("*")
      .eq("status", "queued")
      .order("priority")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!kw) {
      await finishRun(supabase, runId, "skipped", { reason: "keyword bank empty" });
      return json({ success: true, skipped: true, reason: "No queued keywords — add more or wait for GSC sync" });
    }

    const article = await generateArticle(kw.keyword, kw.intent);
    const schema = buildSchema(article, kw.keyword, `https://weprintwraps.com/${article.slug}/`);
    const htmlWithSchema =
      `${article.html_content}\n<script type="application/ld+json">${JSON.stringify(schema)}</script>`;

    const { data: postRow, error: insertErr } = await supabase
      .from("seo_posts")
      .insert({
        keyword_id: kw.id,
        focus_keyword: kw.keyword,
        title: article.title,
        slug: article.slug,
        html_content: htmlWithSchema,
        meta_title: article.meta_title,
        meta_description: article.meta_description,
        faq: article.faq,
        schema_json: schema,
        status: "generated",
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    await supabase.from("seo_keywords").update({ status: "used", used_at: new Date().toISOString() }).eq("id", kw.id);

    let published = 0;
    let publishError: string | null = null;
    if (settings.wp_username && settings.wp_app_password) {
      // Publish this post plus any backlog generated before credentials were saved
      const { data: unpublished } = await supabase
        .from("seo_posts")
        .select("*")
        .in("status", ["generated", "failed"])
        .order("created_at")
        .limit(5);
      for (const p of unpublished ?? []) {
        try {
          const wp = await publishToWordPress(settings, {
            title: p.title,
            slug: p.slug,
            html: p.html_content,
            excerpt: p.meta_description,
            metaTitle: p.meta_title,
            metaDesc: p.meta_description,
            focusKeyword: p.focus_keyword,
          });
          await supabase
            .from("seo_posts")
            .update({ status: "published", wp_post_id: wp.id, published_url: wp.link, published_at: new Date().toISOString(), error: null })
            .eq("id", p.id);
          published++;
        } catch (e) {
          publishError = e instanceof Error ? e.message : String(e);
          await supabase.from("seo_posts").update({ status: "failed", error: publishError }).eq("id", p.id);
        }
      }
    }

    await supabase.from("seo_settings").update({ last_blog_run_at: new Date().toISOString() }).eq("id", 1);
    const stats = {
      keyword: kw.keyword,
      post_id: postRow.id,
      published,
      wp_credentials_present: !!(settings.wp_username && settings.wp_app_password),
    };
    await finishRun(supabase, runId, publishError ? "partial" : "success", stats, publishError ?? undefined);
    return json({ success: true, ...stats, publish_error: publishError });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, runId, "failed", {}, msg);
    return json({ success: false, error: msg }, 500);
  }
}

// ---------------------------------------------------------------------------
// WooCommerce product sweep
// ---------------------------------------------------------------------------

interface ProductRewrite {
  product_id: number;
  new_title: string;
  new_short_description: string;
  new_meta_description: string;
  rationale: string;
}

async function fetchWooProducts(supabase: SupabaseClient, perPage = 50) {
  const res = await wooFetch(
    supabase,
    "/products",
    { per_page: String(perPage), status: "publish", orderby: "popularity", order: "desc" },
  );
  if (!res.ok) throw new Error(`Woo products fetch failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

async function applyRewriteToWoo(supabase: SupabaseClient, productId: number, rewrite: { new_title: string; new_short_description: string; new_meta_description: string }) {
  const res = await wooFetch(supabase, `/products/${productId}`, {}, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: rewrite.new_title,
      short_description: rewrite.new_short_description,
      meta_data: [
        { key: "_yoast_wpseo_metadesc", value: rewrite.new_meta_description },
        { key: "_yoast_wpseo_title", value: rewrite.new_title },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Woo product update failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function actionProductSweep(supabase: SupabaseClient) {
  const runId = await startRun(supabase, "product_sweep");
  try {
    const { data: settings } = await supabase.from("seo_settings").select("*").eq("id", 1).single();
    const batchSize = settings?.product_sweep_batch_size ?? 10;
    const autoApply = settings?.auto_apply_product_sweep ?? false;

    const products = await fetchWooProducts(supabase, 50);

    // Skip products that already have a pending or recently applied rewrite
    const { data: existing } = await supabase
      .from("seo_product_audits")
      .select("woo_product_id")
      .in("status", ["pending", "applied"]);
    const handled = new Set((existing ?? []).map((r: { woo_product_id: number }) => r.woo_product_id));

    const stripHtml = (s: string) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const candidates = products
      .filter((p: any) => !handled.has(p.id))
      .filter((p: any) => stripHtml(p.short_description).length < 120 || p.name.length < 35)
      .slice(0, batchSize)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        short_description: stripHtml(p.short_description).slice(0, 300),
        price: p.price,
        permalink: p.permalink,
      }));

    if (candidates.length === 0) {
      await finishRun(supabase, runId, "success", { proposed: 0, note: "no weak products found in top 50" });
      return json({ success: true, proposed: 0, note: "No weak products found — top 50 all have solid titles/descriptions" });
    }

    const system = `You are an ecommerce SEO specialist for WePrintWraps (wholesale wrap printing, no installation). Rewrite WooCommerce product titles and short descriptions to maximize search CTR and conversions. Titles: 45-60 chars, lead with what it IS + key spec (brand/size/lamination), no clickbait. Short descriptions: 1-2 sentences, answer-first, include material/size/turnaround facts. Meta descriptions: 140-155 chars with a reason to buy. Respond with STRICT JSON only.`;
    const user = `Rewrite these products. Return a JSON array, one object per product:
[{ "product_id": 123, "new_title": "...", "new_short_description": "...", "new_meta_description": "...", "rationale": "one sentence" }]

Products:
${JSON.stringify(candidates, null, 2)}`;

    const rewrites = parseAIJson<ProductRewrite[]>(await callGemini(system, user));
    const byId = new Map(candidates.map((c: any) => [c.id, c]));

    let applied = 0;
    let failed = 0;
    for (const rw of rewrites) {
      const orig: any = byId.get(rw.product_id);
      if (!orig) continue;
      const { data: auditRow } = await supabase
        .from("seo_product_audits")
        .insert({
          run_id: runId,
          woo_product_id: rw.product_id,
          product_name: orig.name,
          old_title: orig.name,
          new_title: rw.new_title,
          old_short_description: orig.short_description,
          new_short_description: rw.new_short_description,
          new_meta_description: rw.new_meta_description,
          rationale: rw.rationale,
          status: "pending",
        })
        .select()
        .single();

      if (autoApply && auditRow) {
        try {
          await applyRewriteToWoo(supabase, rw.product_id, rw);
          await supabase
            .from("seo_product_audits")
            .update({ status: "applied", applied_at: new Date().toISOString() })
            .eq("id", auditRow.id);
          applied++;
        } catch (e) {
          failed++;
          await supabase
            .from("seo_product_audits")
            .update({ status: "failed", error: e instanceof Error ? e.message : String(e) })
            .eq("id", auditRow.id);
        }
      }
    }

    await supabase.from("seo_settings").update({ last_sweep_run_at: new Date().toISOString() }).eq("id", 1);
    const stats = { proposed: rewrites.length, applied, failed, auto_apply: autoApply };
    await finishRun(supabase, runId, failed ? "partial" : "success", stats);
    return json({ success: true, ...stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, runId, "failed", {}, msg);
    return json({ success: false, error: msg }, 500);
  }
}

async function actionApplyProduct(supabase: SupabaseClient, auditId: string) {
  const { data: audit } = await supabase.from("seo_product_audits").select("*").eq("id", auditId).single();
  if (!audit) return json({ success: false, error: "Audit row not found" }, 404);
  if (audit.status !== "pending") return json({ success: false, error: `Status is ${audit.status}, expected pending` }, 400);
  try {
    await applyRewriteToWoo(supabase, audit.woo_product_id, audit);
    await supabase
      .from("seo_product_audits")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", auditId);
    return json({ success: true, applied: audit.woo_product_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("seo_product_audits").update({ status: "failed", error: msg }).eq("id", auditId);
    return json({ success: false, error: msg }, 500);
  }
}

// ---------------------------------------------------------------------------
// Site audit
// ---------------------------------------------------------------------------

async function actionAudit(supabase: SupabaseClient) {
  const runId = await startRun(supabase, "audit");
  try {
    const products = await fetchWooProducts(supabase, 100);
    const stripHtml = (s: string) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const issues: { type: string; product_id?: number; name?: string; detail: string }[] = [];
    for (const p of products) {
      const shortLen = stripHtml(p.short_description).length;
      if (shortLen < 50) issues.push({ type: "thin_short_description", product_id: p.id, name: p.name, detail: `${shortLen} chars` });
      if (p.name.length < 25) issues.push({ type: "short_title", product_id: p.id, name: p.name, detail: `${p.name.length} chars` });
      if (!p.images?.length) issues.push({ type: "no_image", product_id: p.id, name: p.name, detail: "no product image" });
    }

    const recommendations = [
      "Verify weprintwraps.com in Google Search Console (DNS TXT via GoDaddy) and submit the sitemap",
      "Set GSC_SERVICE_ACCOUNT_JSON secret so the engine's daily ranking sync activates",
      "Add Bing Webmaster Tools (imports from GSC, free commercial-intent traffic)",
      "Confirm the WAF/firewall is not challenging Googlebot — site returns 403 to unknown agents",
      "Interlink existing blog posts to product pages (engine does this automatically for new posts)",
    ];

    const stats = {
      products_scanned: products.length,
      issues_found: issues.length,
      issues_by_type: issues.reduce((acc: Record<string, number>, i) => ((acc[i.type] = (acc[i.type] || 0) + 1), acc), {}),
      issues: issues.slice(0, 50),
      recommendations,
    };
    await finishRun(supabase, runId, "success", stats);
    return json({ success: true, ...stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, runId, "failed", {}, msg);
    return json({ success: false, error: msg }, 500);
  }
}

// ---------------------------------------------------------------------------
// Google Search Console sync (service account)
// ---------------------------------------------------------------------------

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const jwt = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google token exchange failed: ${JSON.stringify(data).slice(0, 300)}`);
  return data.access_token;
}

async function actionGscSync(supabase: SupabaseClient) {
  const runId = await startRun(supabase, "gsc_sync");
  const saRaw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!saRaw) {
    await finishRun(supabase, runId, "skipped", { reason: "GSC_SERVICE_ACCOUNT_JSON secret not set" });
    return json({ success: true, skipped: true, reason: "GSC_SERVICE_ACCOUNT_JSON secret not set — verify the site in Search Console and add a service account to activate the ranking loop" });
  }
  try {
    const sa = JSON.parse(saRaw);
    const token = await googleAccessToken(sa);
    const end = new Date();
    const start = new Date(end.getTime() - 28 * 24 * 3600 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    let rows: any[] | null = null;
    let usedProperty = "";
    for (const property of ["sc-domain:weprintwraps.com", "https://weprintwraps.com/"]) {
      const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["date", "page", "query"], rowLimit: 5000 }),
        },
      );
      if (res.ok) {
        rows = (await res.json()).rows ?? [];
        usedProperty = property;
        break;
      }
    }
    if (rows === null) throw new Error("Search Console query failed for both domain and URL-prefix properties — check the service account has access to the property");

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r: any) => ({
        date: r.keys[0],
        page: r.keys[1],
        query: r.keys[2],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));
      await supabase.from("gsc_metrics").upsert(chunk, { onConflict: "date,page,query" });
    }

    // Promote page-2 queries (real impressions, position 8-20) into the keyword bank
    const agg = new Map<string, { impressions: number; position: number; n: number }>();
    for (const r of rows) {
      const q = r.keys[2];
      const cur = agg.get(q) ?? { impressions: 0, position: 0, n: 0 };
      cur.impressions += r.impressions;
      cur.position += r.position;
      cur.n++;
      agg.set(q, cur);
    }
    const promoted: string[] = [];
    for (const [q, a] of agg) {
      const avgPos = a.position / a.n;
      if (a.impressions >= 100 && avgPos >= 8 && avgPos <= 20) promoted.push(q);
    }
    if (promoted.length) {
      await supabase.from("seo_keywords").upsert(
        promoted.slice(0, 20).map((keyword) => ({ keyword, intent: "buyer", priority: 1, source: "gsc" })),
        { onConflict: "keyword", ignoreDuplicates: true },
      );
    }

    await supabase.from("seo_settings").update({ last_gsc_sync_at: new Date().toISOString() }).eq("id", 1);
    const stats = { property: usedProperty, rows: rows.length, page2_keywords_promoted: promoted.length };
    await finishRun(supabase, runId, "success", stats);
    return json({ success: true, ...stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, runId, "failed", {}, msg);
    return json({ success: false, error: msg }, 500);
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function actionStatus(supabase: SupabaseClient) {
  const [settings, posts, keywords, pending, runs, recentPosts, pendingRewrites] = await Promise.all([
    supabase.from("seo_settings").select("site_url, auto_blog_enabled, blog_frequency, auto_apply_product_sweep, product_sweep_batch_size, wp_username, last_blog_run_at, last_sweep_run_at, last_gsc_sync_at").eq("id", 1).single(),
    supabase.from("seo_posts").select("id, status", { count: "exact", head: false }),
    supabase.from("seo_keywords").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("seo_product_audits").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("seo_runs").select("*").order("started_at", { ascending: false }).limit(10),
    supabase.from("seo_posts").select("id, title, focus_keyword, status, published_url, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("seo_product_audits").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(20),
  ]);
  const postRows = posts.data ?? [];
  return json({
    success: true,
    settings: { ...settings.data, wp_connected: !!settings.data?.wp_username },
    counts: {
      posts_total: postRows.length,
      posts_published: postRows.filter((p: { status: string }) => p.status === "published").length,
      keywords_queued: keywords.count ?? 0,
      product_rewrites_pending: pending.count ?? 0,
    },
    gsc_active: !!Deno.env.get("GSC_SERVICE_ACCOUNT_JSON"),
    recent_runs: runs.data ?? [],
    recent_posts: recentPosts.data ?? [],
    pending_rewrites: pendingRewrites.data ?? [],
  });
}

async function actionUpdateSettings(supabase: SupabaseClient, settings: Record<string, unknown>) {
  const allowed = [
    "auto_blog_enabled",
    "blog_frequency",
    "auto_apply_product_sweep",
    "product_sweep_batch_size",
    "wp_username",
    "wp_app_password",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in (settings ?? {})) update[k] = settings[k];
  const { error } = await supabase.from("seo_settings").update(update).eq("id", 1);
  if (error) return json({ success: false, error: error.message }, 500);
  // Reset the cached Woo fallback credential so new settings take effect immediately
  wpBasicAuth = null;
  return json({ success: true });
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "status";
    const supabase = db();

    // Auth: pg_cron presents the shared token; the dashboard sends a Supabase auth header
    const cronHeader = req.headers.get("x-seo-cron");
    if (cronHeader) {
      const { data: settings } = await supabase.from("seo_settings").select("cron_token").eq("id", 1).single();
      if (settings?.cron_token !== cronHeader) return json({ success: false, error: "Invalid cron token" }, 401);
    } else if (!req.headers.get("Authorization")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    console.log(`[seo-engine] action=${action}`);
    switch (action) {
      case "generate_blog":
        return await actionGenerateBlog(supabase);
      case "product_sweep":
        return await actionProductSweep(supabase);
      case "apply_product":
        return await actionApplyProduct(supabase, body.audit_id);
      case "audit":
        return await actionAudit(supabase);
      case "gsc_sync":
        return await actionGscSync(supabase);
      case "status":
        return await actionStatus(supabase);
      case "update_settings":
        return await actionUpdateSettings(supabase, body.settings);
      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[seo-engine] Error:", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
