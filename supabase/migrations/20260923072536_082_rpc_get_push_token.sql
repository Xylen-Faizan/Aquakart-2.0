-- 082_rpc_get_push_token.sql

CREATE OR REPLACE FUNCTION public.get_supplier_push_token(p_supplier_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_push_token TEXT;
BEGIN
    SELECT p.expo_push_token INTO v_push_token
    FROM public.suppliers s
    JOIN public.profiles p ON s.profile_id = p.id
    WHERE s.id = p_supplier_id;

    RETURN v_push_token;
END;
$$;