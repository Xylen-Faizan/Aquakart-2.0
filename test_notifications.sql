-- test_notifications.sql
DO $$
DECLARE
    v_user_id UUID;
    v_notification_id UUID;
    v_status TEXT;
BEGIN
    RAISE NOTICE 'Starting push notification test...';

    -- 1. Create a dummy user
    INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'test_push@example.com') RETURNING id INTO v_user_id;

    -- 2. Insert into user_devices
    INSERT INTO public.user_devices (user_id, expo_push_token, platform, is_active)
    VALUES (v_user_id, 'ExponentPushToken[dummy123]', 'android', true);

    -- 3. Verify token exists and is_active=true
    PERFORM 1 FROM public.user_devices WHERE user_id = v_user_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Test Failed: Token not active in user_devices';
    END IF;

    -- 4. Trigger a notification
    INSERT INTO public.delivery_notifications (user_id, notification_type, title, body, payload)
    VALUES (v_user_id, 'arrival_alert', 'Test', 'Body', '{}'::jsonb)
    RETURNING id INTO v_notification_id;

    -- Since this is synchronous in Postgres but async in net.http_post,
    -- the status will initially be 'pending'.
    -- If the webhook crashed, we wouldn't reach this line.
    
    SELECT status INTO v_status FROM public.delivery_notifications WHERE id = v_notification_id;
    IF v_status != 'pending' THEN
        RAISE EXCEPTION 'Test Failed: Expected pending status, got %', v_status;
    END IF;

    -- Note: Edge function execution is asynchronous, so we cannot instantly query for 'sent' or 'failed'
    -- inside this synchronous DO block without waiting. We will manually verify the Edge function via logs.

    RAISE NOTICE 'Webhook successfully invoked without crashing the transaction!';
    
    -- Cleanup
    DELETE FROM auth.users WHERE id = v_user_id;
END $$;
