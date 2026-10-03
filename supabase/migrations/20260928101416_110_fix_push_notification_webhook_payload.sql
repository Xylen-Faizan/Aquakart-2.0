-- 110_fix_push_notification_webhook_payload.sql
-- The push notification edge function expects a standard Supabase webhook payload
-- containing 'type' and 'table' fields. Our custom trigger omitted these, causing
-- the edge function to ignore all notifications.

CREATE OR REPLACE FUNCTION public.trigger_push_notification_edge_function()
RETURNS trigger AS $$
DECLARE
  edge_function_url text;
BEGIN
  -- Get the project URL from Supabase's predefined config
  edge_function_url := current_setting('request.headers', true)::json->>'x-forwarded-host';
  
  -- Use the project URL if available, otherwise use a fallback (mostly for local dev/testing)
  IF edge_function_url IS NOT NULL THEN
    edge_function_url := 'https://' || edge_function_url || '/functions/v1/push-notifications';
  ELSE
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/push-notifications';
  END IF;

  -- Fire and forget POST request using pg_net
  -- Include 'type' and 'table' so the edge function doesn't ignore it
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- The Edge Function uses the anon key/service key via Authorization header if we pass it,
        -- but since it reads SUPABASE_SERVICE_ROLE_KEY from Deno.env we don't strictly need it,
        -- though it's good practice. (It's an anonymous edge function invocation anyway, relying on the internal net request)
        'Authorization', 'Bearer ' || current_setting('request.jwt.claim.role', true)
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'delivery_notifications',
      'record', row_to_json(NEW)
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
