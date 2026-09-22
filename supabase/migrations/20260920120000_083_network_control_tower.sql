-- ============================================================================
-- 083_network_control_tower.sql
-- Control Tower: Capacity/GPS snapshots, Sectors, Exceptions, and Coverage
-- ============================================================================

-- ============================================================================
-- 1. Table Modifications: delivery_offers
-- ============================================================================
ALTER TABLE public.delivery_offers
ADD COLUMN IF NOT EXISTS decline_reason_code TEXT,
ADD COLUMN IF NOT EXISTS decline_reason_note TEXT,
ADD COLUMN IF NOT EXISTS capacity_snapshot_physical INTEGER,
ADD COLUMN IF NOT EXISTS capacity_snapshot_scheduled INTEGER,
ADD COLUMN IF NOT EXISTS capacity_snapshot_reserved INTEGER,
ADD COLUMN IF NOT EXISTS capacity_snapshot_available INTEGER,
ADD COLUMN IF NOT EXISTS offer_vehicle_lat NUMERIC,
ADD COLUMN IF NOT EXISTS offer_vehicle_lng NUMERIC,
ADD COLUMN IF NOT EXISTS offer_gps_captured_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS offer_gps_accuracy_m NUMERIC,
ADD COLUMN IF NOT EXISTS distance_snapshot_km NUMERIC,
ADD COLUMN IF NOT EXISTS eta_snapshot_minutes INTEGER,
ADD COLUMN IF NOT EXISTS detour_snapshot_minutes INTEGER,
ADD COLUMN IF NOT EXISTS insertion_position_snapshot INTEGER;

-- ============================================================================
-- 2. New Table: network_sectors
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.network_sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    center_lat NUMERIC NOT NULL,
    center_lng NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Populate pilot sectors for Bokaro
INSERT INTO public.network_sectors (name, center_lat, center_lng)
VALUES 
    ('Sector 1', 23.6666, 86.1553),
    ('Sector 2', 23.6700, 86.1511),
    ('Sector 3', 23.6650, 86.1600),
    ('Sector 4', 23.6580, 86.1650),
    ('Sector 5', 23.6550, 86.1500)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.network_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "network_sectors_select" ON public.network_sectors FOR SELECT TO authenticated USING (true);


-- ============================================================================
-- 3. New View: dispatch_exceptions
-- ============================================================================
CREATE OR REPLACE VIEW public.dispatch_exceptions AS
SELECT 
    r.id AS request_id,
    r.customer_id,
    r.quantity,
    r.created_at AS request_created_at,
    r.status AS request_status,
    COUNT(o.id) AS offer_count,
    COUNT(o.id) FILTER (WHERE o.status = 'accepted') AS accepted_count,
    COUNT(o.id) FILTER (WHERE o.status = 'declined') AS declined_count,
    COUNT(o.id) FILTER (WHERE o.status = 'expired') AS expired_count,
    json_agg(
        json_build_object(
            'offer_id', o.id,
            'supplier_id', o.supplier_id,
            'vehicle_id', o.vehicle_id,
            'status', o.status,
            'decline_code', o.decline_reason_code,
            'snapshot_available', o.capacity_snapshot_available,
            'snapshot_distance', o.distance_snapshot_km,
            'offered_at', o.offered_at,
            'responded_at', o.responded_at
        )
    ) FILTER (WHERE o.id IS NOT NULL) AS offers
FROM public.order_dispatch_requests r
LEFT JOIN public.delivery_offers o ON r.id = o.dispatch_request_id
WHERE r.status IN ('failed', 'expired', 'assigned')
GROUP BY r.id, r.customer_id, r.quantity, r.created_at, r.status;

-- ============================================================================
-- 4. New View: opportunity_coverage_live
-- ============================================================================
-- Matches demand (searching requests) against supply (live vehicles with capacity)
CREATE OR REPLACE VIEW public.opportunity_coverage_live AS
WITH active_supply AS (
    SELECT 
        s.id AS sector_id,
        s.name AS sector_name,
        SUM((cap.opportunity_capacity)::numeric) AS supply_jars,
        COUNT(v.*) AS active_vehicles
    FROM public.delivery_run_live_state v
    JOIN public.delivery_runs dr ON v.run_id = dr.id
    CROSS JOIN LATERAL public.get_vehicle_capacity_state(v.run_id) cap
    CROSS JOIN LATERAL (
        SELECT id, name
        FROM public.network_sectors
        ORDER BY (
            pow(center_lat - v.latitude, 2) + pow(center_lng - v.longitude, 2)
        ) ASC
        LIMIT 1
    ) s
    WHERE dr.status IN ('loading', 'in_progress')
    GROUP BY s.id, s.name
),
active_demand AS (
    SELECT 
        s.id AS sector_id,
        SUM(r.quantity) AS demand_jars
    FROM public.order_dispatch_requests r
    JOIN public.addresses a ON r.address_id = a.id
    CROSS JOIN LATERAL (
        SELECT id
        FROM public.network_sectors
        ORDER BY (
            pow(center_lat - a.lat, 2) + pow(center_lng - a.lng, 2)
        ) ASC
        LIMIT 1
    ) s
    WHERE r.status = 'searching'
    GROUP BY s.id
)
SELECT 
    sec.id AS sector_id,
    sec.name AS sector_name,
    COALESCE(sup.supply_jars, 0) AS supply_jars,
    COALESCE(sup.active_vehicles, 0) AS active_vehicles,
    COALESCE(dem.demand_jars, 0) AS demand_jars
FROM public.network_sectors sec
LEFT JOIN active_supply sup ON sec.id = sup.sector_id
LEFT JOIN active_demand dem ON sec.id = dem.sector_id;


-- ============================================================================
-- 5. Modify: find_eligible_vehicles
-- ============================================================================
DROP FUNCTION IF EXISTS public.find_eligible_vehicles(UUID);

CREATE OR REPLACE FUNCTION public.find_eligible_vehicles(
    p_request_id UUID
)
RETURNS TABLE (
    offer_id UUID,
    vehicle_id UUID,
    supplier_id UUID,
    distance_km NUMERIC,
    eta_minutes INTEGER,
    status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_addr RECORD;
    v_conf RECORD;
    v_eligible_count INTEGER := 0;
    v_loc RECORD;
    v_cap RECORD;
    v_dist NUMERIC;
    v_detour_mins INTEGER;
    v_eta_mins INTEGER;
    v_insert_pos INTEGER;
    v_offer_id UUID;
    v_sp RECORD;
    v_freshness_seconds INTEGER;
BEGIN
    SELECT * INTO v_req FROM public.order_dispatch_requests WHERE id = p_request_id;
    IF v_req.status != 'searching' THEN RETURN; END IF;
    
    SELECT * INTO v_addr FROM public.addresses WHERE id = v_req.address_id;
    SELECT * INTO v_conf FROM public.dispatch_configurations LIMIT 1;
    
    FOR v_loc IN 
        SELECT vls.*, dr.supplier_id, dr.driver_id, dr.helper_id
        FROM public.delivery_run_live_state vls
        JOIN public.delivery_runs dr ON vls.run_id = dr.id
        WHERE dr.status IN ('loading', 'in_progress')
    LOOP
        v_freshness_seconds := EXTRACT(EPOCH FROM (now() - v_loc.captured_at));
        IF v_freshness_seconds > v_conf.location_freshness_seconds THEN CONTINUE; END IF;
        
        -- Check product availability
        SELECT * INTO v_sp FROM public.supplier_products 
        WHERE supplier_id = v_loc.supplier_id AND product_id = v_req.product_id AND available = true;
        IF NOT FOUND THEN CONTINUE; END IF;
        
        -- Get capacity snapshot
        SELECT * INTO v_cap FROM public.get_vehicle_capacity_state(v_loc.run_id);
        IF v_cap.opportunity_capacity < v_req.quantity THEN CONTINUE; END IF;
        
        -- Simple distance for pilot
        v_dist := SQRT(POWER(v_addr.lat - v_loc.latitude, 2) + POWER(v_addr.lng - v_loc.longitude, 2)) * 111.32;
        IF v_dist > v_conf.max_customer_distance_km THEN CONTINUE; END IF;
        
        v_eta_mins := CEIL((v_dist / v_conf.assumed_speed_kmh) * 60);
        v_detour_mins := v_eta_mins;
        IF v_detour_mins > v_conf.max_route_detour_minutes THEN CONTINUE; END IF;
        
        -- Default to inserting as next stop
        v_insert_pos := v_loc.current_stop_id + 1;
        
        -- Create Offer with Snapshot
        INSERT INTO public.delivery_offers (
            dispatch_request_id, supplier_id, vehicle_id, run_id, helper_id, driver_id,
            distance_km, eta_minutes, detour_minutes, insertion_position,
            status, offered_at, expires_at,
            capacity_snapshot_physical, capacity_snapshot_scheduled, capacity_snapshot_reserved, capacity_snapshot_available,
            offer_vehicle_lat, offer_vehicle_lng, offer_gps_captured_at, offer_gps_accuracy_m,
            distance_snapshot_km, eta_snapshot_minutes, detour_snapshot_minutes, insertion_position_snapshot
        ) VALUES (
            p_request_id, v_loc.supplier_id, v_loc.vehicle_id, v_loc.run_id, v_loc.helper_id, v_loc.driver_id,
            v_dist, v_eta_mins, v_detour_mins, v_insert_pos,
            'pending', now(), now() + (v_conf.offer_expiry_seconds * interval '1 second'),
            v_cap.physical_remaining, v_cap.scheduled_remaining, v_cap.opportunity_reserved, v_cap.opportunity_capacity,
            v_loc.latitude, v_loc.longitude, v_loc.captured_at, v_loc.accuracy_m,
            v_dist, v_eta_mins, v_detour_mins, v_insert_pos
        )
        ON CONFLICT (dispatch_request_id, run_id) DO NOTHING
        RETURNING id INTO v_offer_id;
        
        IF v_offer_id IS NOT NULL THEN
            v_eligible_count := v_eligible_count + 1;
            RETURN QUERY SELECT v_offer_id, v_loc.vehicle_id, v_loc.supplier_id, v_dist, v_eta_mins, 'pending'::TEXT;
            
            -- Helper notification
            IF v_loc.helper_id IS NOT NULL THEN
                INSERT INTO public.delivery_notifications (
                    supplier_id, recipient_id, type, title, message, related_entity_id, related_entity_type
                ) VALUES (
                    v_loc.supplier_id, (SELECT profile_id FROM public.helpers WHERE id = v_loc.helper_id),
                    'offer', 'New Delivery Opportunity', 
                    'Tap to view ' || v_req.quantity || ' jars.',
                    v_offer_id, 'offer'
                );
            END IF;
            
            -- Supplier notification (Informational)
            INSERT INTO public.delivery_notifications (
                supplier_id, recipient_id, type, title, message, related_entity_id, related_entity_type
            ) VALUES (
                v_loc.supplier_id, (SELECT profile_id FROM public.suppliers WHERE id = v_loc.supplier_id),
                'alert', 'Vehicle Received Opportunity', 
                'Vehicle received an offer. Waiting for helper response.',
                v_offer_id, 'offer'
            );
        END IF;
    END LOOP;
    
    IF v_eligible_count = 0 THEN
        UPDATE public.order_dispatch_requests SET status = 'failed' WHERE id = p_request_id;
    END IF;
    
END;
$$;


-- ============================================================================
-- 6. Modify: decline_delivery_offer
-- ============================================================================
DROP FUNCTION IF EXISTS public.decline_delivery_offer(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.decline_delivery_offer(
    p_offer_id UUID,
    p_reason_code TEXT DEFAULT 'OTHER',
    p_reason_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    UPDATE public.delivery_offers 
    SET 
        status = 'declined', 
        responded_at = now(), 
        responded_by = v_caller,
        decline_reason_code = p_reason_code,
        decline_reason_note = p_reason_note,
        updated_at = now()
    WHERE id = p_offer_id AND status = 'pending';
    
    -- Expiry cron will handle retries if all offers are declined
END;
$$;


-- ============================================================================
-- 7. Modify: expire_stale_dispatches (Supplier Missed Opportunity Notification)
-- ============================================================================
DROP FUNCTION IF EXISTS public.expire_stale_dispatches();

CREATE OR REPLACE FUNCTION public.expire_stale_dispatches()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD;
BEGIN
    -- 1. Expire pending offers
    FOR v_offer IN 
        UPDATE public.delivery_offers 
        SET status = 'expired', updated_at = now()
        WHERE status = 'pending' AND expires_at < now()
        RETURNING *
    LOOP
        -- Notify supplier of missed opportunity
        INSERT INTO public.delivery_notifications (
            supplier_id, recipient_id, type, title, message, related_entity_id, related_entity_type
        ) VALUES (
            v_offer.supplier_id, 
            (SELECT profile_id FROM public.suppliers WHERE id = v_offer.supplier_id),
            'alert', 'Opportunity Expired', 
            'An opportunity expired without response from your staff.',
            v_offer.id, 'offer'
        );
    END LOOP;

    -- 2. Fail requests where all offers are declined/expired
    UPDATE public.order_dispatch_requests r
    SET status = 'failed'
    WHERE status = 'searching' 
      AND NOT EXISTS (
          SELECT 1 FROM public.delivery_offers o 
          WHERE o.dispatch_request_id = r.id AND o.status IN ('pending', 'accepted')
      );
END;
$$;

-- Add RLS for Admin
CREATE POLICY "admin_all_access_delivery_run_live_state" ON public.delivery_run_live_state
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "admin_all_access_order_dispatch_requests" ON public.order_dispatch_requests
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "admin_all_access_delivery_offers" ON public.delivery_offers
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
