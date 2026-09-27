ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN deletion_requested_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN deletion_status TEXT DEFAULT NULL CHECK (deletion_status IN ('pending', 'completed'));

CREATE OR REPLACE FUNCTION request_account_deletion()
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_deletion_date TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check no existing pending deletion
    IF EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = v_user_id AND deletion_status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Account deletion already pending';
    END IF;

    v_deletion_date := now() + interval '30 days';

    UPDATE profiles
    SET deletion_requested_at = now(),
        deletion_status = 'pending'
    WHERE id = v_user_id;

    -- Cancel future scheduled deliveries
    UPDATE customer_delivery_schedules
    SET is_active = false
    WHERE customer_id = v_user_id;

    -- Delete push tokens
    DELETE FROM user_devices
    WHERE user_id = v_user_id;

    -- Revoke consents
    UPDATE legal_consents
    SET revoked_at = now()
    WHERE user_id = v_user_id AND revoked_at IS NULL;

    RETURN json_build_object(
        'success', true,
        'message', 'Account deletion requested successfully',
        'deletion_date', v_deletion_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION cancel_account_deletion()
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE profiles
    SET deletion_requested_at = NULL,
        deletion_status = NULL,
        deleted_at = NULL
    WHERE id = v_user_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Account deletion cancelled successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION execute_pending_deletions()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_profile RECORD;
BEGIN
    FOR v_profile IN 
        SELECT id FROM profiles 
        WHERE deletion_status = 'pending' 
          AND deletion_requested_at < now() - interval '30 days'
    LOOP
        -- Anonymize profile
        UPDATE profiles
        SET name = '[deleted]',
            email = NULL,
            phone = NULL,
            avatar_url = NULL,
            deleted_at = now(),
            deletion_status = 'completed'
        WHERE id = v_profile.id;

        -- Delete addresses for the user
        DELETE FROM addresses
        WHERE user_id = v_profile.id;

        -- Retains order/ledger/jar records for legal compliance
        
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
