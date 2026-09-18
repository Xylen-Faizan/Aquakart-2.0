-- 052_route_operations_core.sql

-- Vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    vehicle_number TEXT NOT NULL,
    vehicle_type TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vehicles_supplier_id ON public.vehicles(supplier_id);

-- Drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(supplier_id, profile_id)
);

CREATE INDEX idx_drivers_supplier_id ON public.drivers(supplier_id);
CREATE INDEX idx_drivers_profile_id ON public.drivers(profile_id);

-- Vehicle Assignments
CREATE TABLE IF NOT EXISTS public.vehicle_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    assignment_date DATE NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Ensure 1 driver per vehicle per day, and 1 vehicle per driver per day
    UNIQUE(vehicle_id, assignment_date),
    UNIQUE(driver_id, assignment_date)
);

CREATE INDEX idx_vehicle_assignments_supplier_date ON public.vehicle_assignments(supplier_id, assignment_date);

-- Delivery Runs
CREATE TYPE delivery_run_status AS ENUM ('planned', 'loading', 'in_progress', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS public.delivery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    run_date DATE NOT NULL,
    status delivery_run_status DEFAULT 'planned',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_delivery_runs_supplier_date ON public.delivery_runs(supplier_id, run_date);
CREATE INDEX idx_delivery_runs_driver_date ON public.delivery_runs(driver_id, run_date);

-- Delivery Run Stops (Snapshot)
CREATE TYPE delivery_stop_status AS ENUM ('planned', 'en_route', 'skipped', 'delivered');

CREATE TABLE IF NOT EXISTS public.delivery_run_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES public.customer_delivery_schedules(id) ON DELETE SET NULL,
    
    sequence_number INTEGER NOT NULL,
    
    -- Snapshot data
    customer_id UUID NOT NULL REFERENCES public.profiles(id),
    address_id UUID REFERENCES public.addresses(id),
    product_id UUID REFERENCES public.products(id),
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    
    status delivery_stop_status DEFAULT 'planned',
    skip_reason TEXT,
    
    planned_arrival_window_start TIMESTAMPTZ,
    planned_arrival_window_end TIMESTAMPTZ,
    
    eta_minutes INTEGER,
    eta_calculated_at TIMESTAMPTZ,
    arrival_alert_sent_at TIMESTAMPTZ,
    
    started_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    skipped_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_delivery_run_stops_run_id ON public.delivery_run_stops(run_id);
CREATE INDEX idx_delivery_run_stops_schedule_id ON public.delivery_run_stops(schedule_id);

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_vehicles
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_drivers
BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_vehicle_assignments
BEFORE UPDATE ON public.vehicle_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_delivery_runs
BEFORE UPDATE ON public.delivery_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_delivery_run_stops
BEFORE UPDATE ON public.delivery_run_stops
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
