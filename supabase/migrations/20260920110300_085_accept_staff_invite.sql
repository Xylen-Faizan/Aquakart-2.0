-- ============================================================================
-- 085_accept_staff_invite.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_staff_invite(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_id UUID;
    v_invite_code TEXT := upper(trim(p_invite_code));
BEGIN
    -- Try helper
    BEGIN
        SELECT public.accept_helper_invite(v_invite_code) INTO v_id;
        v_role := 'helper';
    EXCEPTION WHEN OTHERS THEN
        -- Try driver
        BEGIN
            SELECT public.accept_driver_invite(v_invite_code) INTO v_id;
            v_role := 'driver';
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid or expired invitation code';
        END;
    END;

    RETURN jsonb_build_object(
        'role', v_role,
        'id', v_id
    );
END;
$$;
