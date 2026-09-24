-- 088_fix_push_notification_trigger_url.sql

CREATE OR REPLACE FUNCTION public.trigger_push_notification_edge_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_edge_function_url TEXT;
BEGIN
  -- We assume the edge function is served locally during dev or at a known URL in prod.
  -- Hardcoding for cloud deployment to avoid setting issues
  
  -- The payload sent to the Edge Function will be the newly inserted notification row
  PERFORM net.http_post(
    url := 'https://gmoethzwvoeuajfzqakn.supabase.co/functions/v1/push-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'delivery_notifications',
      'schema', 'public',
      'record', row_to_json(NEW)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't let webhook failure crash the transaction
  RAISE WARNING 'Failed to trigger edge function: %', SQLERRM;
  RETURN NEW;
END;
$function$;