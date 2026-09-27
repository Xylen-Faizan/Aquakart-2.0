-- 099_account_deletion_requests.sql
-- Safe account deletion workflow.
-- This records a verified deletion request; it does NOT destructively delete
-- the account immediately. Operational/financial records may have retention
-- requirements and must be processed according to the platform retention policy.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'in_review', 'completed', 'rejected', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'mobile',
  processed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user
  ON public.account_deletion_requests(user_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_requests_one_active
  ON public.account_deletion_requests(user_id)
  WHERE status IN ('requested', 'in_review');

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own deletion requests"
  ON public.account_deletion_requests;

CREATE POLICY "Users can view own deletion requests"
  ON public.account_deletion_requests
  FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_source TEXT DEFAULT 'mobile'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id
    INTO v_request_id
  FROM public.account_deletion_requests
  WHERE user_id = v_user_id
    AND status IN ('requested', 'in_review')
  ORDER BY requested_at DESC
  LIMIT 1;

  IF v_request_id IS NOT NULL THEN
    RETURN v_request_id;
  END IF;

  INSERT INTO public.account_deletion_requests(user_id, source)
  VALUES (v_user_id, COALESCE(NULLIF(trim(p_source), ''), 'mobile'))
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated;
