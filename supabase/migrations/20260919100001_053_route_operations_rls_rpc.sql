-- 053_route_operations_rls_rpc.sql

-- Enable RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_run_stops ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Suppliers
CREATE POLICY "Suppliers can manage their vehicles" ON public.vehicles
    FOR ALL
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

CREATE POLICY "Suppliers can manage their drivers" ON public.drivers
    FOR ALL
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

CREATE POLICY "Suppliers can manage their vehicle assignments" ON public.vehicle_assignments
    FOR ALL
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

CREATE POLICY "Suppliers can manage their delivery runs" ON public.delivery_runs
    FOR ALL
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

CREATE POLICY "Suppliers can manage their delivery run stops" ON public.delivery_run_stops
    FOR ALL
    USING (run_id IN (
        SELECT id FROM public.delivery_runs WHERE supplier_id IN (
            SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
        )
    ));

-- RLS Policies for Drivers
-- A driver can view their own driver record
CREATE POLICY "Drivers can view their own record" ON public.drivers
    FOR SELECT
    USING (profile_id = auth.uid());

-- A driver can view their assigned vehicles
CREATE POLICY "Drivers can view their vehicle assignments" ON public.vehicle_assignments
    FOR SELECT
    USING (driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid()));

-- A driver can view and update their assigned runs
CREATE POLICY "Drivers can view their runs" ON public.delivery_runs
    FOR SELECT
    USING (driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid()));

CREATE POLICY "Drivers can update their runs" ON public.delivery_runs
    FOR UPDATE
    USING (driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid()));

-- A driver can view and update stops for their assigned runs
CREATE POLICY "Drivers can view their run stops" ON public.delivery_run_stops
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs 
        WHERE driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    ));

CREATE POLICY "Drivers can update their run stops" ON public.delivery_run_stops
    FOR UPDATE
    USING (run_id IN (
        SELECT id FROM public.delivery_runs 
        WHERE driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    ));

-- RPC: generate_daily_run
-- Generates a run and snapshots the schedules into stops
CREATE OR REPLACE FUNCTION generate_daily_run(
    p_supplier_id UUID,
    p_run_date DATE,
    p_vehicle_id UUID,
    p_driver_id UUID,
    p_schedule_ids UUID[]
)
RETURNS UUID AS $$
DECLARE
    v_run_id UUID;
    v_schedule_id UUID;
    v_seq INT := 1;
    v_schedule_record RECORD;
BEGIN
    -- Create the run
    INSERT INTO public.delivery_runs (supplier_id, vehicle_id, driver_id, run_date, status)
    VALUES (p_supplier_id, p_vehicle_id, p_driver_id, p_run_date, 'planned')
    RETURNING id INTO v_run_id;

    -- Create stops from schedules
    FOREACH v_schedule_id IN ARRAY p_schedule_ids
    LOOP
        -- Fetch current schedule and pricing snapshot
        SELECT 
            cds.customer_id,
            p.default_address_id as address_id,
            cds.product_id,
            cds.quantity,
            sc.price as unit_price
        INTO v_schedule_record
        FROM public.customer_delivery_schedules cds
        JOIN public.profiles p ON p.id = cds.customer_id
        LEFT JOIN public.supplier_customers sc ON sc.customer_id = cds.customer_id AND sc.supplier_id = cds.supplier_id
        WHERE cds.id = v_schedule_id;

        IF FOUND THEN
            INSERT INTO public.delivery_run_stops (
                run_id, schedule_id, sequence_number, customer_id, address_id, 
                product_id, quantity, unit_price, total_amount, status
            )
            VALUES (
                v_run_id, 
                v_schedule_id, 
                v_seq, 
                v_schedule_record.customer_id, 
                v_schedule_record.address_id,
                v_schedule_record.product_id,
                v_schedule_record.quantity,
                COALESCE(v_schedule_record.unit_price, 0),
                v_schedule_record.quantity * COALESCE(v_schedule_record.unit_price, 0),
                'planned'
            );
            v_seq := v_seq + 1;
        END IF;
    END LOOP;

    RETURN v_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: update_stop_status
CREATE OR REPLACE FUNCTION update_stop_status(
    p_stop_id UUID,
    p_status delivery_stop_status,
    p_skip_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.delivery_run_stops
    SET 
        status = p_status,
        skip_reason = p_skip_reason,
        arrived_at = CASE WHEN p_status IN ('en_route', 'delivered', 'skipped') AND arrived_at IS NULL THEN now() ELSE arrived_at END,
        delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
        skipped_at = CASE WHEN p_status = 'skipped' THEN now() ELSE skipped_at END,
        updated_at = now()
    WHERE id = p_stop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
