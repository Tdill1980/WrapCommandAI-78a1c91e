-- Mightymail Inbox: Unified email management for WePrintWraps
-- Mailboxes: hello@, design@, support@ weprintwraps.com

-- Main inbox table
CREATE TABLE IF NOT EXISTS public.mightymail_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Email identifiers
  microsoft_id TEXT UNIQUE NOT NULL,  -- Graph API message ID
  conversation_id TEXT,               -- Thread grouping
  
  -- Mailbox info
  mailbox TEXT NOT NULL,              -- hello@, design@, support@
  folder TEXT DEFAULT 'inbox',        -- inbox, sentItems, etc.
  
  -- Email content
  subject TEXT,
  body_preview TEXT,                  -- First 500 chars
  body_html TEXT,                     -- Full HTML body
  
  -- Sender/recipients
  from_email TEXT,
  from_name TEXT,
  to_emails JSONB DEFAULT '[]'::jsonb,
  cc_emails JSONB DEFAULT '[]'::jsonb,
  
  -- Attachments
  has_attachments BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]'::jsonb,  -- [{name, contentType, size, id}]
  
  -- AI classification
  category TEXT,                      -- quote_request, escalation, bulk_order, sponsorship, affiliate, general, file_submission
  confidence FLOAT,                   -- AI confidence score 0-1
  keywords TEXT[],                    -- Extracted keywords
  
  -- Routing
  assigned_to TEXT,                   -- lance@, jackson@, brice@, etc.
  assigned_at TIMESTAMPTZ,
  escalation_level INTEGER DEFAULT 0, -- 0=normal, 1=needs attention, 2=urgent
  
  -- Customer linking
  customer_id UUID,                   -- Link to customers table if exists
  customer_email TEXT,                -- For quick reference
  is_new_customer BOOLEAN DEFAULT false,
  
  -- Quote tracking
  quote_id UUID,                      -- If converted to quote
  quote_status TEXT,                  -- pending, sent, converted, lost
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_processed BOOLEAN DEFAULT false, -- AI has classified
  is_archived BOOLEAN DEFAULT false,
  is_spam BOOLEAN DEFAULT false,
  
  -- Timestamps
  received_at TIMESTAMPTZ,            -- When email was received
  synced_at TIMESTAMPTZ DEFAULT now(), -- When we pulled it
  processed_at TIMESTAMPTZ,           -- When AI classified
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_mightymail_mailbox ON public.mightymail_inbox(mailbox);
CREATE INDEX IF NOT EXISTS idx_mightymail_category ON public.mightymail_inbox(category);
CREATE INDEX IF NOT EXISTS idx_mightymail_assigned ON public.mightymail_inbox(assigned_to);
CREATE INDEX IF NOT EXISTS idx_mightymail_customer ON public.mightymail_inbox(customer_email);
CREATE INDEX IF NOT EXISTS idx_mightymail_received ON public.mightymail_inbox(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mightymail_unprocessed ON public.mightymail_inbox(is_processed) WHERE is_processed = false;
CREATE INDEX IF NOT EXISTS idx_mightymail_unread ON public.mightymail_inbox(is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE public.mightymail_inbox ENABLE ROW LEVEL SECURITY;

-- Policies (internal use only for now)
CREATE POLICY "Service role full access" ON public.mightymail_inbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read access" ON public.mightymail_inbox
  FOR SELECT TO authenticated USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_mightymail_inbox_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_mightymail_inbox_updated_at
BEFORE UPDATE ON public.mightymail_inbox
FOR EACH ROW
EXECUTE FUNCTION public.update_mightymail_inbox_updated_at();

-- Email routing rules table (configurable)
CREATE TABLE IF NOT EXISTS public.mightymail_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Matching conditions (any match triggers)
  category_match TEXT[],              -- Match these categories
  keyword_match TEXT[],               -- Match if any keyword present
  from_domain_match TEXT[],           -- Match sender domain
  subject_contains TEXT[],            -- Match subject text
  
  -- Actions
  assign_to TEXT NOT NULL,            -- Email to assign to
  escalation_level INTEGER DEFAULT 0,
  auto_reply_template TEXT,           -- Optional auto-reply
  notify_sms BOOLEAN DEFAULT false,   -- Send SMS notification
  notify_email BOOLEAN DEFAULT true,  -- Send email notification
  
  -- Priority (lower = higher priority)
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default routing rules
INSERT INTO public.mightymail_routing_rules (name, category_match, assign_to, escalation_level, priority) VALUES
  ('Escalations to Brice & Lance', ARRAY['escalation'], 'brice@weprintwraps.com', 2, 10),
  ('Bulk Orders to Jackson', ARRAY['bulk_order'], 'jackson@weprintwraps.com', 1, 20),
  ('Sponsorships to Jackson', ARRAY['sponsorship'], 'jackson@weprintwraps.com', 1, 30),
  ('Affiliates to Jackson', ARRAY['affiliate'], 'jackson@weprintwraps.com', 1, 40),
  ('File Submissions to Lance', ARRAY['file_submission'], 'lance@weprintwraps.com', 0, 50);

-- Note: Lance also gets escalations - handled in code (multi-assign)

-- Analytics: Track conversions
CREATE TABLE IF NOT EXISTS public.mightymail_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES public.mightymail_inbox(id),
  
  event_type TEXT NOT NULL,           -- received, classified, assigned, quoted, converted, responded
  event_data JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mightymail_analytics_email ON public.mightymail_analytics(email_id);
CREATE INDEX IF NOT EXISTS idx_mightymail_analytics_type ON public.mightymail_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_mightymail_analytics_date ON public.mightymail_analytics(created_at);
