-- =============================================================================
-- Content DNA: Add ai_parsed_at column + auto-parse trigger
-- Enhances existing ai_labels, visual_tags, vehicle_info columns
-- =============================================================================

-- Add ai_parsed_at for tracking parse status (if not already present)
ALTER TABLE public.content_files ADD COLUMN IF NOT EXISTS ai_parsed_at TIMESTAMPTZ;

-- Index for finding unparsed content
CREATE INDEX IF NOT EXISTS idx_content_files_unparsed
  ON public.content_files(ai_parsed_at)
  WHERE ai_parsed_at IS NULL;

-- Trigger function: queue AI parsing for new content files
CREATE OR REPLACE FUNCTION public.queue_content_parse()
RETURNS TRIGGER AS $$
BEGIN
  -- Only parse if there's a URL and it hasn't been parsed yet
  IF NEW.file_url IS NOT NULL AND NEW.ai_parsed_at IS NULL THEN
    INSERT INTO public.ai_actions (
      action_type,
      status,
      payload,
      created_at
    ) VALUES (
      'parse_content_file',
      'pending',
      jsonb_build_object(
        'content_file_id', NEW.id,
        'file_url', NEW.file_url,
        'file_type', NEW.file_type,
        'source', NEW.source
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-parse trigger on content_files insert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_content_file_created') THEN
    CREATE TRIGGER on_content_file_created
      AFTER INSERT ON public.content_files
      FOR EACH ROW
      EXECUTE FUNCTION public.queue_content_parse();
  END IF;
END $$;
