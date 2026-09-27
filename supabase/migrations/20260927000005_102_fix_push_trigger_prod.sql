-- 102_fix_push_trigger_prod.sql
CREATE OR REPLACE FUNCTION trigger_push_notification_edge_function()
RETURNS TRIGGER AS $$
DECLARE
  v_auth_header TEXT;
  v_url TEXT;
BEGIN
  -- We use the service_role_key or anon_key from settings if available (e.g. injected via Vault)
  v_auth_header := current_setting('app.settings.service_role_key', true);
  IF v_auth_header IS NULL OR v_auth_header = '' THEN
    v_auth_header := current_setting('app.settings.anon_key', true);
  END IF;

  -- Fallback to the known production anon_key if the database settings are not configured.
  -- The anon_key is public and safe to include in the migration for Edge Function auth.
  IF v_auth_header IS NULL OR v_auth_header = '' THEN
    v_auth_header := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb2V0aHp3dm9ldWFqZnpxYWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzMxNDcsImV4cCI6MjEwNDk0OTE0N30.eQCfyYsA_1a_mlHAudmt1fWT6QwfKPkhIs5pVWTraYs';
  END IF;

  v_url := current_setting('app.settings.edge_function_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    -- Fallback to the known production URL if the database setting is missing
    v_url := 'https://gmoethzwvoeuajfzqakn.supabase.co/functions/v1/push-notifications';
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_auth_header
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'delivery_notifications',
      'schema', 'public',
      'record', row_to_json(NEW)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Let it fail gracefully so order insertion and other updates succeed
  RAISE WARNING 'Webhook invocation failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
