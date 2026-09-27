CREATE TABLE legal_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL DEFAULT 'terms_and_privacy',
    consent_context TEXT NOT NULL CHECK (consent_context IN ('registration', 'google_signin', 'phone_signin', 'supplier_registration', 'staff_onboarding')),
    privacy_policy_version TEXT NOT NULL,
    terms_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_legal_consents_user_type ON legal_consents(user_id, consent_type);

ALTER TABLE legal_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own consents or admin"
    ON legal_consents FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can insert own consents"
    ON legal_consents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION record_legal_consent(
    p_consent_context TEXT,
    p_privacy_version TEXT,
    p_terms_version TEXT
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_consent_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO legal_consents (
        user_id,
        consent_context,
        privacy_policy_version,
        terms_version
    ) VALUES (
        v_user_id,
        p_consent_context,
        p_privacy_version,
        p_terms_version
    ) RETURNING id INTO v_consent_id;

    RETURN v_consent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
