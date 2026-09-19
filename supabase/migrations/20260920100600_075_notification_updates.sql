-- ============================================================================
-- 075_notification_updates.sql
-- Phase 7: Extend notification system for opportunity order flows
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTEND delivery_notifications for non-stop notifications
-- ---------------------------------------------------------------------------
-- Make stop_id nullable (some notifications are about offers, not stops)
ALTER TABLE public.delivery_notifications
  ALTER COLUMN stop_id DROP NOT NULL;

-- Add offer/dispatch references
ALTER TABLE public.delivery_notifications
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.delivery_offers(id),
  ADD COLUMN IF NOT EXISTS dispatch_request_id UUID REFERENCES public.order_dispatch_requests(id),
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES public.delivery_runs(id);

-- Index for offer-based lookups
CREATE INDEX IF NOT EXISTS idx_delivery_notifications_offer
  ON public.delivery_notifications(offer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notifications_run
  ON public.delivery_notifications(run_id);

-- ---------------------------------------------------------------------------
-- 2. RPC: create_opportunity_notification
--    Creates notification records for helpers and suppliers about new offers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_opportunity_notifications(p_offer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer    RECORD;
    v_request  RECORD;
    v_helper_profile UUID;
    v_supplier_profile UUID;
    v_customer_name TEXT;
    v_product_name TEXT;
    v_body TEXT;
    v_payload JSONB;
BEGIN
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = v_offer.dispatch_request_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get names for notification body
    SELECT name INTO v_customer_name FROM public.profiles WHERE id = v_request.customer_id;
    SELECT name INTO v_product_name FROM public.products WHERE id = v_request.product_id;

    v_body := v_request.quantity || ' × ' || COALESCE(v_product_name, 'Water')
        || ' • ETA ' || v_offer.eta_minutes || ' min'
        || ' • Detour ' || v_offer.detour_minutes || ' min';

    v_payload := jsonb_build_object(
        'type', 'opportunity_order_offer',
        'offer_id', p_offer_id,
        'dispatch_request_id', v_request.id,
        'run_id', v_offer.run_id,
        'vehicle_id', v_offer.vehicle_id,
        'quantity', v_request.quantity,
        'product_id', v_request.product_id,
        'distance_km', v_offer.distance_km,
        'eta_minutes', v_offer.eta_minutes,
        'detour_minutes', v_offer.detour_minutes
    );

    -- Notify helper
    IF v_offer.helper_id IS NOT NULL THEN
        SELECT profile_id INTO v_helper_profile
        FROM public.helpers WHERE id = v_offer.helper_id;

        IF v_helper_profile IS NOT NULL THEN
            INSERT INTO public.delivery_notifications (
                user_id, notification_type, title, body, payload,
                offer_id, dispatch_request_id, run_id
            )
            VALUES (
                v_helper_profile,
                'opportunity_order_offer_helper',
                'New AquaKart Delivery Opportunity',
                v_body,
                v_payload,
                p_offer_id, v_request.id, v_offer.run_id
            );
        END IF;
    END IF;

    -- Notify supplier
    SELECT profile_id INTO v_supplier_profile
    FROM public.suppliers WHERE id = v_offer.supplier_id;

    IF v_supplier_profile IS NOT NULL THEN
        INSERT INTO public.delivery_notifications (
            user_id, notification_type, title, body, payload,
            offer_id, dispatch_request_id, run_id
        )
        VALUES (
            v_supplier_profile,
            'opportunity_order_offer_supplier',
            'New AquaKart Opportunity Near Vehicle',
            v_body,
            v_payload,
            p_offer_id, v_request.id, v_offer.run_id
        );
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: create_acceptance_notification
--    Notifies the customer that their order has been accepted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_acceptance_notification(
    p_order_id UUID,
    p_dispatch_request_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_order   RECORD;
BEGIN
    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = p_dispatch_request_id;
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    IF v_request IS NULL OR v_order IS NULL THEN RETURN; END IF;

    INSERT INTO public.delivery_notifications (
        user_id, notification_type, title, body, payload
    )
    VALUES (
        v_request.customer_id,
        'opportunity_order_accepted',
        'Supplier Found!',
        'Your water delivery is on its way. Track your order in the app.',
        jsonb_build_object(
            'type', 'opportunity_order_accepted',
            'order_id', p_order_id,
            'dispatch_request_id', p_dispatch_request_id,
            'run_id', v_request.assigned_run_id,
            'vehicle_id', v_request.assigned_vehicle_id
        )
    );
END;
$$;
