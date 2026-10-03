-- Fix delivery notifications stop_id constraint
-- Since the push notifications PR repurposed delivery_notifications for both ad-hoc orders and route stops,
-- we must drop the NOT NULL constraint on stop_id to allow ad-hoc delivery completion.

ALTER TABLE public.delivery_notifications
ALTER COLUMN stop_id DROP NOT NULL;
