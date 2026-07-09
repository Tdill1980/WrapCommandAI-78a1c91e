-- design_agent_drafts — review queue for the new design@ support agent.
--
-- The agent (supabase/functions/design-agent) reads design@weprintwraps.com via
-- Microsoft Graph, drafts a reply with OpenAI grounded in the matching
-- shopflow_orders row, and writes ONE row here per inbound email.
--
-- v1 is DRAFT + ALARM ONLY: nothing is emailed to a customer automatically.
-- A human reviews each draft (status pending_review -> approved/sent/dismissed).

create table if not exists public.design_agent_drafts (
  id               uuid primary key default gen_random_uuid(),
  email_id         text not null unique,          -- Graph message id (dedupe key)
  conversation_id  text,                           -- Graph conversationId (thread)
  mailbox          text not null default 'design@weprintwraps.com',
  from_email       text,
  from_name        text,
  subject          text,
  received_at      timestamptz,
  order_number     text,                           -- parsed #35xxx, if any
  order_status     text,                           -- from shopflow_orders, if matched
  intent           text,                           -- revision | approval | quote | complaint | shipping | question | other
  urgency          text default 'normal',          -- low | normal | high
  refund_risk      boolean not null default false,
  summary          text,                           -- one-line AI summary of what they want
  draft_reply      text,                           -- the AI-drafted reply (NOT sent)
  model            text,                           -- which OpenAI model produced it
  status           text not null default 'pending_review', -- pending_review | approved | sent | dismissed
  alarmed          boolean not null default false, -- did we page a human about this one
  error            text,                           -- populated if a step failed
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists design_agent_drafts_status_idx
  on public.design_agent_drafts (status, created_at desc);
create index if not exists design_agent_drafts_conversation_idx
  on public.design_agent_drafts (conversation_id);

-- keep updated_at fresh
create or replace function public.touch_design_agent_drafts()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_design_agent_drafts on public.design_agent_drafts;
create trigger trg_touch_design_agent_drafts
  before update on public.design_agent_drafts
  for each row execute function public.touch_design_agent_drafts();

-- RLS: the edge function writes with the service role (bypasses RLS).
-- Signed-in staff may read/update from the dashboard review queue.
alter table public.design_agent_drafts enable row level security;

drop policy if exists design_agent_drafts_read on public.design_agent_drafts;
create policy design_agent_drafts_read
  on public.design_agent_drafts for select
  to authenticated using (true);

drop policy if exists design_agent_drafts_update on public.design_agent_drafts;
create policy design_agent_drafts_update
  on public.design_agent_drafts for update
  to authenticated using (true) with check (true);
