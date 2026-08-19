-- instagram_tokens: where facebook-auth persists Meta Page / Instagram tokens.
--
-- This table was missing in WrapCommand-Production, and facebook-auth treated
-- the failed write as non-fatal — it logged the error, returned success:true
-- and told the user "Connected to {page}". Every completed OAuth run therefore
-- discarded its token while reporting success, with no way for the user to
-- tell. The function now fails loudly; this creates the table it needs.
--
-- IF NOT EXISTS because the table does exist in some environments; this must
-- be safe to replay.
create table if not exists public.instagram_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  user_access_token text,
  page_access_token text,
  access_token text,            -- legacy alias kept for older callers
  page_id text,
  page_name text,
  instagram_user_id text,
  instagram_username text,
  expires_at timestamptz,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per org is what facebook-auth's upsert assumes; without this two
-- concurrent connects race and leave duplicates that maybeSingle() then
-- errors on, reintroducing the same silent-failure path by another route.
create unique index if not exists instagram_tokens_org_uniq
  on public.instagram_tokens (organization_id)
  where organization_id is not null;

-- These rows are long-lived Meta credentials. Only the service role (which
-- edge functions use) may touch them; no anon or authenticated access.
alter table public.instagram_tokens enable row level security;
