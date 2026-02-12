-- Chat fallback leads: captures customer inquiries when AI fails
-- Every row = a potential lost sale that needs human follow-up

CREATE TABLE IF NOT EXISTS chat_fallback_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT,
  customer_message TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  detected_intent TEXT,
  fallback_reply TEXT,
  error_message TEXT,
  page_url TEXT,
  geo_data JSONB,
  status TEXT DEFAULT 'needs_followup' CHECK (status IN ('needs_followup', 'contacted', 'resolved', 'spam')),
  followed_up_at TIMESTAMPTZ,
  followed_up_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_fallback_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages fallback leads" ON chat_fallback_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view fallback leads" ON chat_fallback_leads
  FOR SELECT TO authenticated USING (true);
