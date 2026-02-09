-- Design Desk: File submission tracking and routing
-- Files from emails → Design team (Lance)

CREATE TABLE IF NOT EXISTS public.design_desk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source tracking
  source TEXT NOT NULL,              -- mightymail, chat, upload, etc.
  source_id TEXT,                    -- email_id, conversation_id, etc.
  
  -- Customer info
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_id UUID,                  -- Link to customers table
  
  -- Order linking
  order_number TEXT,                 -- WooCommerce order number if known
  shopflow_id UUID,                  -- Link to shopflow_orders
  
  -- File info
  files JSONB DEFAULT '[]'::jsonb,   -- [{name, type, size, url, microsoft_id}]
  file_count INTEGER DEFAULT 0,
  
  -- Job details
  vehicle_year TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  wrap_type TEXT,                    -- full, partial, graphics, etc.
  notes TEXT,                        -- Special instructions
  
  -- Status workflow
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Just received
    'in_review',    -- Designer looking at it
    'needs_info',   -- Missing info, waiting for customer
    'approved',     -- Ready for production
    'in_production',-- Being printed
    'complete',     -- Done
    'rejected'      -- Can't use files
  )),
  
  -- Assignment
  assigned_to TEXT,                  -- lance@weprintwraps.com, etc.
  assigned_at TIMESTAMPTZ,
  
  -- Priority
  priority INTEGER DEFAULT 0,        -- 0=normal, 1=rush, 2=urgent
  due_date TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_design_desk_status ON public.design_desk(status);
CREATE INDEX IF NOT EXISTS idx_design_desk_assigned ON public.design_desk(assigned_to);
CREATE INDEX IF NOT EXISTS idx_design_desk_order ON public.design_desk(order_number);
CREATE INDEX IF NOT EXISTS idx_design_desk_customer ON public.design_desk(customer_email);
CREATE INDEX IF NOT EXISTS idx_design_desk_created ON public.design_desk(created_at DESC);

-- Enable RLS
ALTER TABLE public.design_desk ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.design_desk
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read access" ON public.design_desk
  FOR SELECT TO authenticated USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_design_desk_updated_at()
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

CREATE TRIGGER update_design_desk_updated_at
BEFORE UPDATE ON public.design_desk
FOR EACH ROW
EXECUTE FUNCTION public.update_design_desk_updated_at();
