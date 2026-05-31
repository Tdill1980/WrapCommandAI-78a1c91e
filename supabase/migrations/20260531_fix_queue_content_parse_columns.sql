-- Fix queue_content_parse() column mismatch that blocked ALL content ingestion.
--
-- The trigger fires on every insert/update of public.content_files and tried to
-- INSERT into public.ai_actions (status, payload). Those columns do not exist —
-- the real ai_actions schema uses action_payload (jsonb) and resolved (bool).
-- As a result every content_files insert (including video registration for the
-- AI video editor) failed with: column "status" of relation "ai_actions" does
-- not exist. This aligns the function to the actual schema.
CREATE OR REPLACE FUNCTION public.queue_content_parse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.file_url IS NOT NULL AND NEW.ai_parsed_at IS NULL THEN
    INSERT INTO public.ai_actions (
      organization_id,
      action_type,
      action_payload,
      resolved,
      created_at
    ) VALUES (
      NEW.organization_id,
      'parse_content_file',
      jsonb_build_object(
        'content_file_id', NEW.id,
        'file_url', NEW.file_url,
        'file_type', NEW.file_type,
        'source', NEW.source,
        'status', 'pending'
      ),
      false,
      now()
    );
  END IF;
  RETURN NEW;
END;
$function$;
