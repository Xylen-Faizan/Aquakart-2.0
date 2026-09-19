-- ============================================================================
-- 076_rls_security_hardening.sql
-- Phase 8: Comprehensive RLS, search_path hardening, additional indexes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SET search_path ON ALL EXISTING SECURITY DEFINER FUNCTIONS
-- ---------------------------------------------------------------------------

-- Route operations
ALTER FUNCTION generate_daily_run(UUID, DATE, UUID, UUID, UUID[], UUID)
  SET search_path = public;

ALTER FUNCTION update_stop_status(UUID, delivery_stop_status, TEXT)
  SET search_path = public;

-- ETA engine
ALTER FUNCTION process_vehicle_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ)
  SET search_path = public;

ALTER FUNCTION calculate_distance_km(FLOAT, FLOAT, FLOAT, FLOAT)
  SET search_path = public;

-- Phase 2-3 functions
ALTER FUNCTION confirm_run_load(UUID, JSONB)
  SET search_path = public;

ALTER FUNCTION get_vehicle_capacity_state(UUID)
  SET search_path = public;

ALTER FUNCTION start_delivery_run(UUID)
  SET search_path = public;

ALTER FUNCTION complete_delivery_run_stop(UUID, INTEGER)
  SET search_path = public;

-- Phase 5 dispatch functions
ALTER FUNCTION create_dispatch_request(UUID, UUID, INTEGER)
  SET search_path = public;

ALTER FUNCTION find_eligible_vehicles(UUID)
  SET search_path = public;

ALTER FUNCTION accept_delivery_offer(UUID)
  SET search_path = public;

ALTER FUNCTION decline_delivery_offer(UUID)
  SET search_path = public;

-- Phase 6
ALTER FUNCTION get_order_tracking_state(UUID)
  SET search_path = public;

-- Phase 7
ALTER FUNCTION create_opportunity_notifications(UUID)
  SET search_path = public;

ALTER FUNCTION create_acceptance_notification(UUID, UUID)
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. ADDITIONAL INDEXES (spec section 71)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_delivery_runs_date_status
  ON public.delivery_runs(run_date, status);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_vehicle_status
  ON public.delivery_runs(vehicle_id, status);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_date_vehicle
  ON public.vehicle_assignments(assignment_date, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_date_driver
  ON public.vehicle_assignments(assignment_date, driver_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_run_captured
  ON public.vehicle_locations(run_id, captured_at DESC);

-- ---------------------------------------------------------------------------
-- 3. VERIFY CROSS-ENTITY ISOLATION
--    Ensure no supplier can see another supplier's resources.
-- ---------------------------------------------------------------------------

-- Vehicles: supplier-scoped (already exists from 053)
-- Drivers: supplier-scoped (already exists from 053)
-- Helpers: supplier-scoped (created in 069)
-- Vehicle Assignments: supplier-scoped (already exists from 053)
-- Delivery Runs: supplier-scoped (already exists from 053)
-- Delivery Run Stops: run-scoped (already exists from 053)
-- Delivery Run Loads: run-scoped (created in 070)
-- Dispatch Requests: customer-scoped (created in 072)
-- Delivery Offers: supplier-scoped (created in 072)
-- Live State: run-scoped (created in 074)

-- No additional RLS changes needed — all tables are already protected.
-- The architecture uses SECURITY DEFINER RPCs with explicit ownership
-- validation for all mutations, so RLS serves as a secondary defense layer.

-- ---------------------------------------------------------------------------
-- 4. ENSURE delivery_run_live_state CLEANUP ON RUN COMPLETION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_completed_run_state()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status IN ('completed', 'cancelled') AND OLD.status = 'in_progress' THEN
        DELETE FROM public.delivery_run_live_state
        WHERE run_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_run_live_state
AFTER UPDATE ON public.delivery_runs
FOR EACH ROW
WHEN (NEW.status IN ('completed', 'cancelled'))
EXECUTE FUNCTION cleanup_completed_run_state();

-- ---------------------------------------------------------------------------
-- 5. EXPIRE STALE DISPATCH REQUESTS AND OFFERS (background-callable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_stale_dispatches()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_expired_count INTEGER := 0;
BEGIN
    -- Expire dispatch requests past their expiry
    UPDATE public.order_dispatch_requests
    SET status = 'expired'
    WHERE status IN ('searching', 'offered')
      AND expires_at < now();

    GET DIAGNOSTICS v_expired_count = ROW_COUNT;

    -- Expire pending offers past their expiry
    UPDATE public.delivery_offers
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < now();

    RETURN v_expired_count;
END;
$$;
