-- ============================================================================
-- 072_dispatch_requests_offers.sql
-- Phase 4: Pre-assignment dispatch layer for marketplace/on-demand customers
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. DISPATCH CONFIGURATION TABLE (single-row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_config (
    id                        INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    max_customer_distance_km  NUMERIC(6,2) NOT NULL DEFAULT 5.0,
    max_route_detour_minutes  INTEGER NOT NULL DEFAULT 10,
    location_freshness_seconds INTEGER NOT NULL DEFAULT 60,
    offer_expiry_seconds      INTEGER NOT NULL DEFAULT 30,
    search_timeout_seconds    INTEGER NOT NULL DEFAULT 60,
    arrival_alert_distance_m  INTEGER NOT NULL DEFAULT 500,
    arrival_alert_eta_minutes INTEGER NOT NULL DEFAULT 5,
    assumed_speed_kmh         NUMERIC(5,1) NOT NULL DEFAULT 15.0,
    updated_at                TIMESTAMPTZ DEFAULT now()
);

-- Insert the default configuration
INSERT INTO public.dispatch_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. ORDER DISPATCH REQUESTS TABLE
--    Pre-assignment object for on-demand customers searching for a vehicle.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_dispatch_requests (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id          UUID NOT NULL REFERENCES public.profiles(id),
    address_id           UUID NOT NULL REFERENCES public.addresses(id),
    product_id           UUID NOT NULL REFERENCES public.products(id),
    quantity             INTEGER NOT NULL CHECK (quantity > 0),

    status               TEXT NOT NULL DEFAULT 'searching'
                         CHECK (status IN (
                             'searching', 'offered', 'assigned',
                             'expired', 'cancelled', 'failed'
                         )),

    -- Populated upon successful assignment
    assigned_order_id    UUID REFERENCES public.orders(id),
    assigned_run_id      UUID REFERENCES public.delivery_runs(id),
    assigned_vehicle_id  UUID REFERENCES public.vehicles(id),
    assigned_supplier_id UUID REFERENCES public.suppliers(id),

    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds')
);

CREATE INDEX idx_dispatch_requests_status      ON public.order_dispatch_requests(status, created_at);
CREATE INDEX idx_dispatch_requests_customer    ON public.order_dispatch_requests(customer_id);
CREATE INDEX idx_dispatch_requests_assigned    ON public.order_dispatch_requests(assigned_order_id);

CREATE TRIGGER set_updated_at_dispatch_requests
BEFORE UPDATE ON public.order_dispatch_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 3. DELIVERY OFFERS TABLE
--    Connects a dispatch request to a specific active route/vehicle.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_offers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_request_id   UUID NOT NULL REFERENCES public.order_dispatch_requests(id) ON DELETE CASCADE,
    supplier_id           UUID NOT NULL REFERENCES public.suppliers(id),
    vehicle_id            UUID NOT NULL REFERENCES public.vehicles(id),
    run_id                UUID NOT NULL REFERENCES public.delivery_runs(id),
    helper_id             UUID REFERENCES public.helpers(id),
    driver_id             UUID REFERENCES public.drivers(id),

    -- Computed at offer creation time
    distance_km           NUMERIC(8,3),
    eta_minutes           INTEGER,
    detour_minutes        INTEGER,
    insertion_position    INTEGER,    -- Which sequence position in route

    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                              'pending', 'accepted', 'declined',
                              'expired', 'cancelled'
                          )),

    offered_at            TIMESTAMPTZ DEFAULT now(),
    expires_at            TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 seconds'),
    responded_at          TIMESTAMPTZ,
    responded_by          UUID REFERENCES public.profiles(id),

    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_delivery_offers_dispatch     ON public.delivery_offers(dispatch_request_id, status);
CREATE INDEX idx_delivery_offers_run          ON public.delivery_offers(run_id, status);
CREATE INDEX idx_delivery_offers_supplier     ON public.delivery_offers(supplier_id, status);

CREATE TRIGGER set_updated_at_delivery_offers
BEFORE UPDATE ON public.delivery_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS FOR dispatch tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.dispatch_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;

-- Config is readable by all authenticated (needed by dispatch functions)
CREATE POLICY "Config readable by authenticated" ON public.dispatch_config
    FOR SELECT TO authenticated USING (true);

-- Admin-only writes to config
CREATE POLICY "Admin can modify config" ON public.dispatch_config
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Customer can read own dispatch requests
CREATE POLICY "Customers can view own dispatch requests" ON public.order_dispatch_requests
    FOR SELECT
    USING (customer_id = auth.uid());

-- Customer can insert dispatch requests
CREATE POLICY "Customers can create dispatch requests" ON public.order_dispatch_requests
    FOR INSERT
    WITH CHECK (customer_id = auth.uid());

-- Supplier can read offers for their runs
CREATE POLICY "Suppliers can view their offers" ON public.delivery_offers
    FOR SELECT
    USING (supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    ));

-- Helper can read offers for their assigned run
CREATE POLICY "Helpers can view their run offers" ON public.delivery_offers
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE helper_id IN (
            SELECT id FROM public.helpers WHERE profile_id = auth.uid()
        )
    ));

-- Driver can read offers for their assigned run (informational)
CREATE POLICY "Drivers can view their run offers" ON public.delivery_offers
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE driver_id IN (
            SELECT id FROM public.drivers WHERE profile_id = auth.uid()
        )
    ));
