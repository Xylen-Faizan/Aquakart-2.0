-- ============================================================================
-- 069_helper_crew_model.sql
-- Phase 1: Helper entity, crew model extension, profile role extension,
--          invitation-based helper onboarding
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTEND PROFILE ROLES
--    Add 'driver' and 'helper' to the allowed role values.
--    Existing users are not affected.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('customer', 'supplier', 'admin', 'driver', 'helper'));

-- ---------------------------------------------------------------------------
-- 2. CREATE helpers TABLE
--    Mirror of drivers — links a profile to a supplier as an operational helper.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.helpers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(supplier_id, profile_id)
);

CREATE INDEX idx_helpers_supplier_id ON public.helpers(supplier_id);
CREATE INDEX idx_helpers_profile_id  ON public.helpers(profile_id);

CREATE TRIGGER set_updated_at_helpers
BEFORE UPDATE ON public.helpers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 3. INVITATION-BASED HELPER ONBOARDING
--    Supplier generates a one-time code. Helper enters it to link themselves.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.helper_invitations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id   UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    invite_code   TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    accepted_by   UUID REFERENCES public.profiles(id),
    accepted_at   TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_helper_invitations_supplier ON public.helper_invitations(supplier_id);
CREATE INDEX idx_helper_invitations_code     ON public.helper_invitations(invite_code);

CREATE TRIGGER set_updated_at_helper_invitations
BEFORE UPDATE ON public.helper_invitations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Similarly for drivers (same flow)
CREATE TABLE IF NOT EXISTS public.driver_invitations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id   UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    invite_code   TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    accepted_by   UUID REFERENCES public.profiles(id),
    accepted_at   TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_driver_invitations_supplier ON public.driver_invitations(supplier_id);
CREATE INDEX idx_driver_invitations_code     ON public.driver_invitations(invite_code);

CREATE TRIGGER set_updated_at_driver_invitations
BEFORE UPDATE ON public.driver_invitations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RPC: generate_helper_invite
--    Supplier creates an invitation code for a prospective helper.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_helper_invite(p_supplier_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_supplier_owner UUID;
BEGIN
    -- Verify caller owns this supplier
    SELECT profile_id INTO v_supplier_owner
    FROM public.suppliers WHERE id = p_supplier_id;

    IF v_supplier_owner IS NULL OR v_supplier_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: you do not own this supplier';
    END IF;

    -- Generate a 6-character alphanumeric code
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    INSERT INTO public.helper_invitations (supplier_id, invite_code)
    VALUES (p_supplier_id, v_code);

    RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: accept_helper_invite
--    Helper (authenticated user) enters the code to link themselves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_helper_invite(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
    v_helper_id UUID;
    v_caller UUID := auth.uid();
BEGIN
    -- Find the invitation
    SELECT * INTO v_invitation
    FROM public.helper_invitations
    WHERE invite_code = upper(trim(p_invite_code))
      AND status = 'pending'
      AND expires_at > now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation code';
    END IF;

    -- Check if this profile is already a helper for this supplier
    SELECT id INTO v_helper_id
    FROM public.helpers
    WHERE supplier_id = v_invitation.supplier_id
      AND profile_id = v_caller;

    IF v_helper_id IS NOT NULL THEN
        -- Already linked — just mark invitation accepted
        UPDATE public.helper_invitations
        SET status = 'accepted', accepted_by = v_caller, accepted_at = now()
        WHERE id = v_invitation.id;
        RETURN v_helper_id;
    END IF;

    -- Create the helper record
    INSERT INTO public.helpers (supplier_id, profile_id)
    VALUES (v_invitation.supplier_id, v_caller)
    RETURNING id INTO v_helper_id;

    -- Update the profile role to 'helper'
    UPDATE public.profiles SET role = 'helper' WHERE id = v_caller;

    -- Mark invitation accepted
    UPDATE public.helper_invitations
    SET status = 'accepted', accepted_by = v_caller, accepted_at = now()
    WHERE id = v_invitation.id;

    RETURN v_helper_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: generate_driver_invite / accept_driver_invite (same pattern)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_driver_invite(p_supplier_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_supplier_owner UUID;
BEGIN
    SELECT profile_id INTO v_supplier_owner
    FROM public.suppliers WHERE id = p_supplier_id;

    IF v_supplier_owner IS NULL OR v_supplier_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: you do not own this supplier';
    END IF;

    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    INSERT INTO public.driver_invitations (supplier_id, invite_code)
    VALUES (p_supplier_id, v_code);

    RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION accept_driver_invite(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
    v_driver_id UUID;
    v_caller UUID := auth.uid();
BEGIN
    SELECT * INTO v_invitation
    FROM public.driver_invitations
    WHERE invite_code = upper(trim(p_invite_code))
      AND status = 'pending'
      AND expires_at > now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation code';
    END IF;

    SELECT id INTO v_driver_id
    FROM public.drivers
    WHERE supplier_id = v_invitation.supplier_id
      AND profile_id = v_caller;

    IF v_driver_id IS NOT NULL THEN
        UPDATE public.driver_invitations
        SET status = 'accepted', accepted_by = v_caller, accepted_at = now()
        WHERE id = v_invitation.id;
        RETURN v_driver_id;
    END IF;

    INSERT INTO public.drivers (supplier_id, profile_id)
    VALUES (v_invitation.supplier_id, v_caller)
    RETURNING id INTO v_driver_id;

    UPDATE public.profiles SET role = 'driver' WHERE id = v_caller;

    UPDATE public.driver_invitations
    SET status = 'accepted', accepted_by = v_caller, accepted_at = now()
    WHERE id = v_invitation.id;

    RETURN v_driver_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. EXTEND vehicle_assignments WITH helper_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicle_assignments
  ADD COLUMN IF NOT EXISTS helper_id UUID REFERENCES public.helpers(id);

-- One helper per day — no double-assignment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vehicle_assignments_helper_date_unique'
    ) THEN
        ALTER TABLE public.vehicle_assignments
          ADD CONSTRAINT vehicle_assignments_helper_date_unique
          UNIQUE (helper_id, assignment_date);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_helper_date
  ON public.vehicle_assignments(assignment_date, helper_id);

-- ---------------------------------------------------------------------------
-- 8. EXTEND delivery_runs WITH helper_id (crew snapshot)
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_runs
  ADD COLUMN IF NOT EXISTS helper_id UUID REFERENCES public.helpers(id);

CREATE INDEX IF NOT EXISTS idx_delivery_runs_helper ON public.delivery_runs(helper_id);

-- ---------------------------------------------------------------------------
-- 9. RLS FOR helpers TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.helpers ENABLE ROW LEVEL SECURITY;

-- Supplier full access to own helpers
CREATE POLICY "Suppliers can manage their helpers" ON public.helpers
    FOR ALL
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

-- Helper can read their own record
CREATE POLICY "Helpers can view their own record" ON public.helpers
    FOR SELECT
    USING (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 10. RLS FOR invitation tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.helper_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_invitations ENABLE ROW LEVEL SECURITY;

-- Suppliers can manage their own invitations
CREATE POLICY "Suppliers manage helper invitations" ON public.helper_invitations
    FOR ALL
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

CREATE POLICY "Suppliers manage driver invitations" ON public.driver_invitations
    FOR ALL
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

-- Anyone can read invitations by code (for accept flow, handled via SECURITY DEFINER RPC)

-- ---------------------------------------------------------------------------
-- 11. EXTEND HELPER RLS for vehicle_assignments and delivery_runs
-- ---------------------------------------------------------------------------

-- Helper can view their vehicle assignments
CREATE POLICY "Helpers can view their vehicle assignments" ON public.vehicle_assignments
    FOR SELECT
    USING (helper_id IN (SELECT id FROM public.helpers WHERE profile_id = auth.uid()));

-- Helper can view their assigned runs
CREATE POLICY "Helpers can view their runs" ON public.delivery_runs
    FOR SELECT
    USING (helper_id IN (SELECT id FROM public.helpers WHERE profile_id = auth.uid()));

-- Helper can view stops for their assigned runs
CREATE POLICY "Helpers can view their run stops" ON public.delivery_run_stops
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE helper_id IN (SELECT id FROM public.helpers WHERE profile_id = auth.uid())
    ));

-- Helper can update stops for their assigned runs (mark delivered)
CREATE POLICY "Helpers can update their run stops" ON public.delivery_run_stops
    FOR UPDATE
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE helper_id IN (SELECT id FROM public.helpers WHERE profile_id = auth.uid())
    ));
