-- 110: Update get_order_tracking_state for UI data
-- Drops and replaces the function to include order_created_at, driver_name, and driver_phone.

DROP FUNCTION IF EXISTS public.get_order_tracking_state(uuid);

CREATE OR REPLACE FUNCTION public.get_order_tracking_state(p_order_id uuid)
 RETURNS TABLE(
   order_status text, 
   vehicle_lat double precision, 
   vehicle_lng double precision, 
   eta_minutes integer, 
   vehicle_number text, 
   stop_status text, 
   last_updated timestamp with time zone, 
   gps_fresh boolean, 
   run_id uuid,
   order_created_at timestamp with time zone,
   driver_name text,
   driver_phone text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        o.status AS order_status,
        ls.latitude AS vehicle_lat,
        ls.longitude AS vehicle_lng,
        ls.eta_minutes,
        v.vehicle_number,
        drs.status::TEXT AS stop_status,
        ls.captured_at AS last_updated,
        (ls.captured_at >= now() - interval '90 seconds') AS gps_fresh,
        dr.id AS run_id,
        o.created_at AS order_created_at,
        p.name AS driver_name,
        p.phone AS driver_phone
    FROM public.orders o
    LEFT JOIN public.delivery_run_stops drs ON drs.order_id = o.id
    LEFT JOIN public.delivery_runs dr ON dr.id = drs.run_id
    LEFT JOIN public.delivery_run_live_state ls ON ls.run_id = dr.id
    LEFT JOIN public.vehicles v ON v.id = dr.vehicle_id
    LEFT JOIN public.drivers d ON d.id = dr.driver_id
    LEFT JOIN public.profiles p ON p.id = d.profile_id
    WHERE o.id = p_order_id
      AND o.customer_id = v_caller;  -- SECURITY: only own orders
END;
$function$;
