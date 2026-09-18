-- 054_smart_route_tracking.sql

-- User Devices (for push tokens)
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    platform TEXT,
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, expo_push_token)
);

CREATE INDEX idx_user_devices_user_id ON public.user_devices(user_id);

-- Vehicle Locations (Telemetry)
CREATE TABLE IF NOT EXISTS public.vehicle_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    accuracy_m DOUBLE PRECISION,
    
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vehicle_locations_run_id ON public.vehicle_locations(run_id);
-- No updated_at needed for telemetry (append-only)

-- Delivery Notifications (Outbox)
CREATE TYPE notification_status AS ENUM ('pending', 'processing', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS public.delivery_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stop_id UUID NOT NULL REFERENCES public.delivery_run_stops(id) ON DELETE CASCADE,
    
    notification_type TEXT NOT NULL, -- e.g., 'arrival_alert'
    
    title TEXT,
    body TEXT,
    payload JSONB,
    
    status notification_status DEFAULT 'pending',
    error_message TEXT,
    attempt_count INTEGER DEFAULT 0,
    
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_delivery_notifications_status ON public.delivery_notifications(status);
CREATE INDEX idx_delivery_notifications_stop_id ON public.delivery_notifications(stop_id);

CREATE TRIGGER set_updated_at_delivery_notifications
BEFORE UPDATE ON public.delivery_notifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_notifications ENABLE ROW LEVEL SECURITY;

-- Device token policies
CREATE POLICY "Users can manage their own devices" ON public.user_devices
    FOR ALL
    USING (user_id = auth.uid());

-- Location policies
CREATE POLICY "Drivers can insert locations for their runs" ON public.vehicle_locations
    FOR INSERT
    WITH CHECK (run_id IN (
        SELECT id FROM public.delivery_runs WHERE driver_id IN (
            SELECT id FROM public.drivers WHERE profile_id = auth.uid()
        )
    ));

-- Notification policies (Users can read their own notifications)
CREATE POLICY "Users can read their notifications" ON public.delivery_notifications
    FOR SELECT
    USING (user_id = auth.uid());
