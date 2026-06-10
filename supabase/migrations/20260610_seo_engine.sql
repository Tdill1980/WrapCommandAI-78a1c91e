-- =============================================================================
-- Migration: SEO + AEO Engine (qxllysilzonrlyoaomce)
-- Self-contained SEO engine on YOUR Supabase — no dependency on the Lovable
-- backend. Tables + keyword bank + pg_cron schedules driving the seo-engine
-- edge function.
-- =============================================================================

-- 1. seo_settings — singleton engine config
CREATE TABLE IF NOT EXISTS public.seo_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_url TEXT NOT NULL DEFAULT 'https://weprintwraps.com',
  auto_blog_enabled BOOLEAN NOT NULL DEFAULT true,
  blog_frequency TEXT NOT NULL DEFAULT 'daily',
  auto_apply_product_sweep BOOLEAN NOT NULL DEFAULT false,
  product_sweep_batch_size INTEGER NOT NULL DEFAULT 10,
  -- WordPress application password: publishes blog posts (wp/v2) and serves
  -- as the fallback credential for Woo product writes when the
  -- WOO_CONSUMER_KEY/SECRET function secrets are missing or stale.
  wp_username TEXT,
  wp_app_password TEXT,
  -- shared token pg_cron sends so the edge function can authenticate cron calls
  cron_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  last_blog_run_at TIMESTAMPTZ,
  last_sweep_run_at TIMESTAMPTZ,
  last_gsc_sync_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.seo_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. seo_keywords — keyword bank the blog engine consumes
CREATE TABLE IF NOT EXISTS public.seo_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  intent TEXT NOT NULL DEFAULT 'buyer', -- buyer | comparison | informational | local | trade
  priority INTEGER NOT NULL DEFAULT 5,  -- 1 = highest
  status TEXT NOT NULL DEFAULT 'queued', -- queued | used | skipped
  source TEXT NOT NULL DEFAULT 'seed',   -- seed | gsc | manual
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. seo_posts — generated articles and their publish state
CREATE TABLE IF NOT EXISTS public.seo_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id UUID REFERENCES public.seo_keywords(id),
  focus_keyword TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  html_content TEXT NOT NULL,
  meta_title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  faq JSONB,          -- [{question, answer}] used for FAQPage schema
  schema_json JSONB,  -- full JSON-LD embedded in the post
  status TEXT NOT NULL DEFAULT 'generated', -- generated | queued_for_publish | published | failed
  wp_post_id INTEGER,
  published_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- 4. seo_runs — every engine execution
CREATE TABLE IF NOT EXISTS public.seo_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL, -- generate_blog | product_sweep | audit | gsc_sync | apply_product
  status TEXT NOT NULL DEFAULT 'running', -- running | success | partial | failed | skipped
  stats JSONB,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- 5. seo_product_audits — proposed/applied WooCommerce product rewrites
CREATE TABLE IF NOT EXISTS public.seo_product_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.seo_runs(id),
  woo_product_id INTEGER NOT NULL,
  product_name TEXT,
  old_title TEXT,
  new_title TEXT,
  old_short_description TEXT,
  new_short_description TEXT,
  new_meta_description TEXT,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | applied | failed | rejected
  applied_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. gsc_metrics — Google Search Console performance (fills once GSC creds set)
CREATE TABLE IF NOT EXISTS public.gsc_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  page TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC,
  position NUMERIC,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, page, query)
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_status ON public.seo_keywords (status, priority);
CREATE INDEX IF NOT EXISTS idx_seo_posts_status ON public.seo_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_product_audits_status ON public.seo_product_audits (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_query ON public.gsc_metrics (query, date DESC);

-- RLS: internal ops tool — any authenticated team member can manage
ALTER TABLE public.seo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_product_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gsc_metrics ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['seo_settings','seo_keywords','seo_posts','seo_runs','seo_product_audits','gsc_metrics'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- 7. Seed keyword bank — buyer/trade intent topics aligned to WPW products,
-- avoiding topics the previous auto-blog already covered
INSERT INTO public.seo_keywords (keyword, intent, priority) VALUES
  ('wrap by the yard printed vinyl', 'buyer', 1),
  ('wholesale wrap printing for installers', 'trade', 1),
  ('box truck wrap cost', 'buyer', 1),
  ('trailer wrap cost and design', 'buyer', 1),
  ('food truck wrap design and printing', 'buyer', 1),
  ('perforated window vinyl for business windows', 'buyer', 2),
  ('cut contour vinyl graphics explained', 'buyer', 2),
  ('3M IJ180 vs Avery 1105 wrap film', 'comparison', 1),
  ('printed wrap film vs color change vinyl', 'comparison', 2),
  ('van lettering vs full van wrap', 'comparison', 2),
  ('how long do vehicle wraps last', 'informational', 2),
  ('vehicle wrap file setup requirements', 'trade', 2),
  ('vehicle wrap design templates guide', 'trade', 3),
  ('wrap printing turnaround time what to expect', 'buyer', 3),
  ('best vinyl for fleet graphics', 'buyer', 2),
  ('vehicle wrap advertising statistics roi', 'buyer', 2),
  ('how to start a vehicle wrap business', 'trade', 2),
  ('outsourcing wrap printing vs buying a printer', 'trade', 1),
  ('chrome delete cost and options', 'buyer', 3),
  ('hood wrap and roof wrap cost', 'buyer', 3),
  ('racing stripes vinyl install guide', 'informational', 4),
  ('boat wrap printing cost', 'buyer', 3),
  ('wall wraps and floor graphics printing', 'buyer', 3),
  ('window perf design guidelines 50 50', 'trade', 3),
  ('camo and carbon wrap by the yard styles', 'buyer', 3),
  ('wrap care and maintenance tips', 'informational', 4),
  ('commercial fleet rebranding with wraps', 'buyer', 2),
  ('vehicle wrap cost calculator guide', 'buyer', 1)
ON CONFLICT (keyword) DO NOTHING;

-- 8. Cron schedules → seo-engine edge function
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('seo-engine-daily-blog','seo-engine-product-sweep','seo-engine-gsc-sync','seo-engine-weekly-audit');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Daily AEO blog post — 13:00 UTC (~9am ET)
SELECT cron.schedule(
  'seo-engine-daily-blog',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/seo-engine',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-seo-cron',(SELECT cron_token FROM public.seo_settings WHERE id = 1)
    ),
    body := '{"action":"generate_blog"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Weekly product sweep — Mondays 14:00 UTC (writes proposals; auto-applies only if toggled)
SELECT cron.schedule(
  'seo-engine-product-sweep',
  '0 14 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/seo-engine',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-seo-cron',(SELECT cron_token FROM public.seo_settings WHERE id = 1)
    ),
    body := '{"action":"product_sweep"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Daily GSC sync — 13:30 UTC (no-op until GSC_SERVICE_ACCOUNT_JSON secret is set)
SELECT cron.schedule(
  'seo-engine-gsc-sync',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/seo-engine',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-seo-cron',(SELECT cron_token FROM public.seo_settings WHERE id = 1)
    ),
    body := '{"action":"gsc_sync"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Weekly site audit — Mondays 15:00 UTC
SELECT cron.schedule(
  'seo-engine-weekly-audit',
  '0 15 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/seo-engine',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-seo-cron',(SELECT cron_token FROM public.seo_settings WHERE id = 1)
    ),
    body := '{"action":"audit"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
