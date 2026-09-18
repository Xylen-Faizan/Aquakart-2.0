-- 056_notification_webhook.sql

-- Note: This requires the pg_net extension to be enabled if running outside of Supabase hosted platform.
-- On Supabase, you can also create this via the Database Webhooks UI.
-- For local/CLI development, you use the standard pg_net HTTP request function wrapper provided by Supabase.

-- Create a generic trigger function that calls the edge function
CREATE OR REPLACE FUNCTION trigger_push_notification_edge_function()
RETURNS TRIGGER AS $$
DECLARE
  v_edge_function_url TEXT;
BEGIN
  -- We assume the edge function is served locally during dev or at a known URL in prod.
  -- In a real setup, you'd use a secret or env var, but for this migration we'll use a placeholder
  -- or rely on the Supabase UI to set the exact URL. 
  
  -- The payload sent to the Edge Function will be the newly inserted notification row
  PERFORM net.http_post(
    url := coalesce(current_setting('app.settings.edge_function_url', true), 'http://kong:8000/functions/v1/push-notifications'),
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the outbox table
DROP TRIGGER IF EXISTS delivery_notifications_webhook ON public.delivery_notifications;

CREATE TRIGGER delivery_notifications_webhook
AFTER INSERT ON public.delivery_notifications
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION trigger_push_notification_edge_function();
