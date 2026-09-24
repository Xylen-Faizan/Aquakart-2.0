CREATE OR REPLACE FUNCTION public.trigger_push_notification_edge_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_edge_function_url TEXT;
BEGIN
  
  -- Use hardcoded anon key so edge function doesn't get rejected as unauthorized
  PERFORM net.http_post(
    url := 'https://gmoethzwvoeuajfzqakn.supabase.co/functions/v1/push-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb2V0aHp3dm9ldWFqZnpxYWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzMxNDcsImV4cCI6MjEwNDk0OTE0N30.eQCfyYsA_1a_mlHAudmt1fWT6QwfKPkhIs5pVWTraYs"}'::jsonb,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'delivery_notifications',
      'schema', 'public',
      'record', row_to_json(NEW)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to trigger edge function: %', SQLERRM;
  RETURN NEW;
END;
$function$;
