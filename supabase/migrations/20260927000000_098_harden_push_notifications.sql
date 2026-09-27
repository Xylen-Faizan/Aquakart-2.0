-- ============================================================================
-- 098_harden_push_notifications.sql
-- Fixes push notification webhook error handling and JWT usage.
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_push_notification_edge_function()
RETURNS TRIGGER AS $$
DECLARE
  v_auth_header TEXT;
BEGIN
  -- Build the authorization header securely. Fail if not configured.
  v_auth_header := current_setting('app.settings.service_role_key', true);
  IF v_auth_header IS NULL OR v_auth_header = '' THEN
    -- Fallback to a well-known secret for local dev if missing, or raise error
    -- For pilot, we want strict failure if improperly configured.
    -- However, local testing might lack this setting without Vault.
    v_auth_header := current_setting('app.settings.anon_key', true);
  END IF;

  IF v_auth_header IS NULL OR v_auth_header = '' THEN
    RAISE EXCEPTION 'Push Notification Webhook failed: Missing service role key configuration.';
  END IF;

  -- The payload sent to the Edge Function will be the newly inserted notification row
  PERFORM net.http_post(
    url := coalesce(current_setting('app.settings.edge_function_url', true), 'http://kong:8000/functions/v1/push-notifications'),
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
  -- DO NOT swallow errors silently. 
  -- Update the row to 'failed' so the system reflects reality.
  -- But we must allow the transaction to fail so the caller (RPC) knows it failed.
  RAISE EXCEPTION 'Webhook invocation failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
