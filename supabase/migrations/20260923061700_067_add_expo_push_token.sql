-- 067_add_expo_push_token.sql
-- Add expo_push_token to profiles for notifications

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Create an RPC to update the push token easily
CREATE OR REPLACE FUNCTION public.update_push_token(
    p_token TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET expo_push_token = p_token,
        updated_at = NOW()
    WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
