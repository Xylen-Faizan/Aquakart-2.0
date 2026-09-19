-- ============================================================================
-- 070_vehicle_run_loads.sql
-- Phase 2: Vehicle-run physical load tracking and capacity calculation
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CREATE delivery_run_loads TABLE
--    Physical inventory loaded onto a specific vehicle for a specific run.
--    This is NOT supplier_capacity and NOT supplier_inventory.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_run_loads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              UUID NOT NULL REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
    supplier_product_id UUID NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
    loaded_quantity     INTEGER NOT NULL CHECK (loaded_quantity >= 0),
    confirmed_by        UUID REFERENCES public.profiles(id),
    confirmed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(run_id, supplier_product_id)
);

CREATE INDEX idx_delivery_run_loads_run ON public.delivery_run_loads(run_id);

CREATE TRIGGER set_updated_at_delivery_run_loads
BEFORE UPDATE ON public.delivery_run_loads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS FOR delivery_run_loads
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_run_loads ENABLE ROW LEVEL SECURITY;

-- Supplier full access
CREATE POLICY "Suppliers can manage their run loads" ON public.delivery_run_loads
    FOR ALL
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
        )
    ));

-- Helper can read loads for their assigned run
CREATE POLICY "Helpers can view their run loads" ON public.delivery_run_loads
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE helper_id IN (
            SELECT id FROM public.helpers WHERE profile_id = auth.uid()
        )
    ));

-- Driver can read loads for their assigned run
CREATE POLICY "Drivers can view their run loads" ON public.delivery_run_loads
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE driver_id IN (
            SELECT id FROM public.drivers WHERE profile_id = auth.uid()
        )
    ));

-- ---------------------------------------------------------------------------
-- 3. RPC: confirm_run_load
--    Helper or supplier confirms the physical load on a vehicle.
--    p_product_loads is JSONB array: [{"supplier_product_id": "...", "quantity": N}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_run_load(
    p_run_id       UUID,
    p_product_loads JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_run        RECORD;
    v_caller     UUID := auth.uid();
    v_is_helper  BOOLEAN := false;
    v_is_supplier BOOLEAN := false;
    v_load       JSONB;
    v_sp_id      UUID;
    v_qty        INTEGER;
BEGIN
    -- 1. Fetch and lock the run
    SELECT * INTO v_run
    FROM public.delivery_runs
    WHERE id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Run not found';
    END IF;

    -- 2. Validate run status
    IF v_run.status NOT IN ('planned', 'loading') THEN
        RAISE EXCEPTION 'Run cannot be loaded in status: %', v_run.status;
    END IF;

    -- 3. Verify caller authorization
    -- Is caller the assigned helper?
    IF v_run.helper_id IS NOT NULL THEN
        PERFORM 1 FROM public.helpers
        WHERE id = v_run.helper_id AND profile_id = v_caller;
        IF FOUND THEN v_is_helper := true; END IF;
    END IF;

    -- Is caller the supplier owner?
    PERFORM 1 FROM public.suppliers
    WHERE id = v_run.supplier_id AND profile_id = v_caller;
    IF FOUND THEN v_is_supplier := true; END IF;

    IF NOT v_is_helper AND NOT v_is_supplier THEN
        RAISE EXCEPTION 'Unauthorized: only the assigned helper or supplier can confirm loads';
    END IF;

    -- 4. Upsert load entries
    FOR v_load IN SELECT * FROM jsonb_array_elements(p_product_loads)
    LOOP
        v_sp_id := (v_load ->> 'supplier_product_id')::UUID;
        v_qty   := (v_load ->> 'quantity')::INTEGER;

        IF v_qty < 0 THEN
            RAISE EXCEPTION 'Loaded quantity cannot be negative';
        END IF;

        -- Verify supplier_product belongs to this supplier
        PERFORM 1 FROM public.supplier_products
        WHERE id = v_sp_id AND supplier_id = v_run.supplier_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not belong to this supplier', v_sp_id;
        END IF;

        INSERT INTO public.delivery_run_loads (run_id, supplier_product_id, loaded_quantity, confirmed_by, confirmed_at)
        VALUES (p_run_id, v_sp_id, v_qty, v_caller, now())
        ON CONFLICT (run_id, supplier_product_id)
        DO UPDATE SET
            loaded_quantity = EXCLUDED.loaded_quantity,
            confirmed_by = EXCLUDED.confirmed_by,
            confirmed_at = EXCLUDED.confirmed_at;
    END LOOP;

    -- 5. Transition run status to 'loading'
    IF v_run.status = 'planned' THEN
        UPDATE public.delivery_runs
        SET status = 'loading'
        WHERE id = p_run_id;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: get_vehicle_capacity_state
--    Returns the authoritative capacity calculation for a run.
--    physical_remaining = loaded - delivered
--    scheduled_remaining = SUM(future scheduled stop quantities)
--    opportunity_reserved = SUM(accepted opportunistic stop quantities not delivered)
--    opportunity_capacity = physical_remaining - scheduled_remaining - opportunity_reserved
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_vehicle_capacity_state(p_run_id UUID)
RETURNS TABLE (
    supplier_product_id   UUID,
    loaded_quantity       INTEGER,
    delivered_quantity    INTEGER,
    physical_remaining   INTEGER,
    scheduled_remaining  INTEGER,
    opportunity_reserved INTEGER,
    opportunity_capacity INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH loads AS (
        SELECT
            drl.supplier_product_id,
            drl.loaded_quantity
        FROM public.delivery_run_loads drl
        WHERE drl.run_id = p_run_id
          AND drl.confirmed_at IS NOT NULL
    ),
    delivered AS (
        SELECT
            -- Map product_id from stops back to supplier_product via supplier_products
            sp.id AS supplier_product_id,
            COALESCE(SUM(drs.quantity), 0)::INTEGER AS qty
        FROM public.delivery_run_stops drs
        JOIN public.delivery_runs dr ON dr.id = drs.run_id
        JOIN public.supplier_products sp ON sp.product_id = drs.product_id AND sp.supplier_id = dr.supplier_id
        WHERE drs.run_id = p_run_id
          AND drs.status = 'delivered'
        GROUP BY sp.id
    ),
    sched_remaining AS (
        SELECT
            sp.id AS supplier_product_id,
            COALESCE(SUM(drs.quantity), 0)::INTEGER AS qty
        FROM public.delivery_run_stops drs
        JOIN public.delivery_runs dr ON dr.id = drs.run_id
        JOIN public.supplier_products sp ON sp.product_id = drs.product_id AND sp.supplier_id = dr.supplier_id
        WHERE drs.run_id = p_run_id
          AND drs.status IN ('planned', 'en_route')
          AND (drs.stop_type IS NULL OR drs.stop_type = 'scheduled')
        GROUP BY sp.id
    ),
    opp_reserved AS (
        SELECT
            sp.id AS supplier_product_id,
            COALESCE(SUM(drs.quantity), 0)::INTEGER AS qty
        FROM public.delivery_run_stops drs
        JOIN public.delivery_runs dr ON dr.id = drs.run_id
        JOIN public.supplier_products sp ON sp.product_id = drs.product_id AND sp.supplier_id = dr.supplier_id
        WHERE drs.run_id = p_run_id
          AND drs.status IN ('planned', 'en_route')
          AND drs.stop_type = 'opportunistic'
        GROUP BY sp.id
    )
    SELECT
        l.supplier_product_id,
        l.loaded_quantity,
        COALESCE(d.qty, 0)::INTEGER AS delivered_quantity,
        (l.loaded_quantity - COALESCE(d.qty, 0))::INTEGER AS physical_remaining,
        COALESCE(sr.qty, 0)::INTEGER AS scheduled_remaining,
        COALESCE(opr.qty, 0)::INTEGER AS opportunity_reserved,
        (l.loaded_quantity - COALESCE(d.qty, 0) - COALESCE(sr.qty, 0) - COALESCE(opr.qty, 0))::INTEGER AS opportunity_capacity
    FROM loads l
    LEFT JOIN delivered d ON d.supplier_product_id = l.supplier_product_id
    LEFT JOIN sched_remaining sr ON sr.supplier_product_id = l.supplier_product_id
    LEFT JOIN opp_reserved opr ON opr.supplier_product_id = l.supplier_product_id;
END;
$$;
