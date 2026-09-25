-- 097_legal_consent.sql
-- Minimal, append-only record of acceptance/acknowledgement of the current
-- Terms and Privacy Policy versions. This stores only the user id, document
-- version, timestamp and source channel.

CREATE TABLE IF NOT EXISTS public.user_legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('terms', 'privacy')),
  document_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'mobile'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_legal_consents_unique
  ON public.user_legal_consents(user_id, document_type, document_version);

ALTER TABLE public.user_legal_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own legal consents" ON public.user_legal_consents;
CREATE POLICY "Users can view own legal consents"
  ON public.user_legal_consents
  FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_legal_consent(
  p_terms_version TEXT,
  p_privacy_version TEXT,
  p_source TEXT DEFAULT 'mobile'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_legal_consents(user_id, document_type, document_version, source)
  VALUES
    (v_user_id, 'terms', p_terms_version, COALESCE(p_source, 'mobile')),
    (v_user_id, 'privacy', p_privacy_version, COALESCE(p_source, 'mobile'))
  ON CONFLICT (user_id, document_type, document_version) DO NOTHING;
END;
$$;
