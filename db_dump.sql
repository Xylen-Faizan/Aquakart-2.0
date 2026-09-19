


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."customer_type_enum" AS ENUM (
    'household',
    'office',
    'factory',
    'shop',
    'restaurant',
    'hostel',
    'hospital',
    'event',
    'other'
);


ALTER TYPE "public"."customer_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."delivery_run_status" AS ENUM (
    'planned',
    'loading',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."delivery_run_status" OWNER TO "postgres";


CREATE TYPE "public"."delivery_stop_status" AS ENUM (
    'planned',
    'en_route',
    'skipped',
    'delivered'
);


ALTER TYPE "public"."delivery_stop_status" OWNER TO "postgres";


CREATE TYPE "public"."jar_transaction_type" AS ENUM (
    'delivered_to_customer',
    'returned_by_customer',
    'damaged',
    'lost',
    'adjustment',
    'legacy'
);


ALTER TYPE "public"."jar_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_status" AS ENUM (
    'pending',
    'processing',
    'sent',
    'failed'
);


ALTER TYPE "public"."notification_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_status_enum" AS ENUM (
    'pending',
    'completed',
    'failed'
);


ALTER TYPE "public"."payment_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    
    v_supplier_id := public.get_supplier_id();

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_supplier_id IS NULL OR v_order.supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Order is not assigned to you'; END IF;
    IF v_order.status != 'placed' THEN RAISE EXCEPTION 'Order must be in placed status to accept'; END IF;

    SELECT SUM(quantity) INTO v_total_quantity FROM public.order_items WHERE order_id = p_order_id;
    v_order_date := timezone('Asia/Kolkata', now())::date;

    -- Lock and check capacity
    PERFORM 1 FROM public.supplier_capacity WHERE supplier_id = v_order.supplier_id AND date = v_order_date FOR UPDATE;

    UPDATE public.supplier_capacity
    SET reserved_quantity = reserved_quantity + v_total_quantity
    WHERE supplier_id = v_order.supplier_id AND date = v_order_date
    AND max_capacity >= reserved_quantity + fulfilled_quantity + v_total_quantity;

    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient capacity'; END IF;

    UPDATE public.orders SET status = 'accepted', capacity_date = v_order_date WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, 'accepted', auth.uid());
END;
$$;


ALTER FUNCTION "public"."accept_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reassign_order"("p_order_id" "uuid", "p_new_supplier_id" "uuid", "p_reason" "text" DEFAULT 'Admin reassignment'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order RECORD;
    v_target_supplier RECORD;
    v_order_item RECORD;
    v_supplier_product RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status NOT IN ('placed', 'accepted', 'preparing') THEN
        RAISE EXCEPTION 'Order cannot be reassigned in current state';
    END IF;

    -- Validate target supplier is active
    SELECT * INTO v_target_supplier FROM public.suppliers WHERE id = p_new_supplier_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target supplier not found'; END IF;
    IF NOT v_target_supplier.is_active THEN RAISE EXCEPTION 'Target supplier is not active'; END IF;

    -- Verify target supplier offers the ordered product and has it available
    FOR v_order_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        SELECT * INTO v_supplier_product FROM public.supplier_products 
        WHERE supplier_id = p_new_supplier_id AND product_id = v_order_item.product_id;
        
        IF NOT FOUND THEN RAISE EXCEPTION 'Target supplier does not offer product %', v_order_item.product_id; END IF;
        IF NOT v_supplier_product.available THEN RAISE EXCEPTION 'Target supplier product % is not available', v_order_item.product_id; END IF;
    END LOOP;

    -- Update order
    UPDATE public.orders 
    SET supplier_id = p_new_supplier_id, 
        status = 'placed', -- Reset to placed for new supplier
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Log history
    INSERT INTO public.order_status_history (order_id, status, notes)
    VALUES (p_order_id, 'placed', 'Reassigned to new supplier by admin: ' || p_reason);
END;
$$;


ALTER FUNCTION "public"."admin_reassign_order"("p_order_id" "uuid", "p_new_supplier_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_supplier_status"("p_supplier_id" "uuid", "p_is_active" boolean, "p_is_verified" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.suppliers
    SET 
        is_active = COALESCE(p_is_active, is_active),
        is_verified = COALESCE(p_is_verified, is_verified)
    WHERE id = p_supplier_id;
END;
$$;


ALTER FUNCTION "public"."admin_update_supplier_status"("p_supplier_id" "uuid", "p_is_active" boolean, "p_is_verified" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_distance_km"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) RETURNS double precision
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    radius FLOAT := 6371; -- Earth's radius in km
    dlat FLOAT;
    dlon FLOAT;
    a FLOAT;
    c FLOAT;
BEGIN
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);
    a := sin(dlat/2) * sin(dlat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2) * sin(dlon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    RETURN radius * c;
END;
$$;


ALTER FUNCTION "public"."calculate_distance_km"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text" DEFAULT 'cash'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_delivery_id UUID;
    v_unit_price NUMERIC(10,2);
    v_total_amount NUMERIC(10,2);
    v_current_jar_balance INTEGER;
    v_next_due_date DATE;
    v_today DATE;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated as a supplier'; END IF;
    v_today := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
    
    -- Verify customer ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized: Customer not yours'; END IF;

    -- 1. Resolve Effective Price Server-Side
    v_unit_price := public.get_effective_customer_price(p_customer_id, p_supplier_product_id);
    v_total_amount := p_quantity * v_unit_price;

    -- 2. Mark Delivery Completed (Snapshotting the unit price)
    INSERT INTO public.deliveries (supplier_id, supplier_customer_id, status, delivery_date, total_amount)
    VALUES (v_supplier_id, p_customer_id, 'delivered', v_today, v_total_amount)
    RETURNING id INTO v_delivery_id;

    INSERT INTO public.delivery_items (delivery_id, supplier_product_id, quantity, unit_price, total_price)
    VALUES (v_delivery_id, p_supplier_product_id, p_quantity, v_unit_price, v_total_amount);

    -- 3. Create Financial Debit (Ledger)
    IF v_total_amount > 0 THEN
        INSERT INTO public.customer_ledger_entries (supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by)
        VALUES (v_supplier_id, p_customer_id, 'delivery', v_delivery_id, 'debit', v_total_amount, auth.uid());
    END IF;

    -- 4. Record Payment (Credit Ledger)
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (supplier_id, supplier_customer_id, delivery_id, amount, payment_method)
        VALUES (v_supplier_id, p_customer_id, v_delivery_id, p_amount_collected, p_payment_method);

        INSERT INTO public.customer_ledger_entries (supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by)
        VALUES (v_supplier_id, p_customer_id, 'payment', v_delivery_id, 'credit', p_amount_collected, auth.uid());
    END IF;

    -- 5. Update Jar State (Transactionally locked)
    IF p_jars_delivered > 0 OR p_jars_returned > 0 THEN
        -- Lock the row to prevent race conditions
        SELECT jars_with_customer INTO v_current_jar_balance 
        FROM public.customer_jar_balances 
        WHERE supplier_customer_id = p_customer_id 
        FOR UPDATE;

        IF (v_current_jar_balance + p_jars_delivered - p_jars_returned) < 0 THEN
            RAISE EXCEPTION 'Negative jar balance constraint violation';
        END IF;

        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, jars_delivered, jars_returned)
        VALUES (p_customer_id, v_delivery_id, p_jars_delivered, p_jars_returned);
        
        UPDATE public.customer_jar_balances
        SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
        WHERE supplier_customer_id = p_customer_id;

        -- Update Supplier Inventory logic
        UPDATE public.supplier_inventory
        SET available = available - p_jars_delivered + p_jars_returned,
            with_customers = with_customers + p_jars_delivered - p_jars_returned
        WHERE supplier_id = v_supplier_id;
        
        IF p_jars_delivered > 0 THEN
            INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
            VALUES (v_supplier_id, 'delivery', v_delivery_id, -p_jars_delivered);
        END IF;
        
        IF p_jars_returned > 0 THEN
            INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
            VALUES (v_supplier_id, 'return', v_delivery_id, p_jars_returned);
        END IF;
    END IF;

    -- 6. Advance Recurring Schedule
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = v_today + interval_days
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id
    AND is_active = true;

    RETURN v_delivery_id;
END;
$$;


ALTER FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text" DEFAULT 'cash'::"text", "p_idempotency_key" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_delivery_id UUID;
    v_unit_price NUMERIC(10,2);
    v_total_amount NUMERIC(10,2);
    v_current_jar_balance INTEGER;
    v_next_due_date DATE;
    v_today DATE;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated as a supplier'; END IF;
    v_today := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
    
    -- Verify customer ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized: Customer not yours'; END IF;

    -- 1. Resolve Effective Price Server-Side
    v_unit_price := public.get_effective_customer_price(p_customer_id, p_supplier_product_id);
    v_total_amount := p_quantity * v_unit_price;

    -- 2. Mark Delivery Completed (Snapshotting the unit price)
    -- This INSERT will fail with a unique constraint violation if the idempotency_key is already present.
    -- This is intentional. The error will bubble up, aborting the transaction.
    INSERT INTO public.deliveries (supplier_id, supplier_customer_id, status, delivery_date, total_amount, idempotency_key)
    VALUES (v_supplier_id, p_customer_id, 'delivered', v_today, v_total_amount, p_idempotency_key)
    RETURNING id INTO v_delivery_id;

    INSERT INTO public.delivery_items (delivery_id, supplier_product_id, quantity, unit_price, total_price)
    VALUES (v_delivery_id, p_supplier_product_id, p_quantity, v_unit_price, v_total_amount);

    -- 3. Create Financial Debit (Ledger)
    IF v_total_amount > 0 THEN
        INSERT INTO public.customer_ledger_entries (supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by)
        VALUES (v_supplier_id, p_customer_id, 'delivery', v_delivery_id, 'debit', v_total_amount, auth.uid());
    END IF;

    -- 4. Record Payment (Credit Ledger)
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (supplier_id, supplier_customer_id, delivery_id, amount, payment_method)
        VALUES (v_supplier_id, p_customer_id, v_delivery_id, p_amount_collected, p_payment_method);

        INSERT INTO public.customer_ledger_entries (supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by)
        VALUES (v_supplier_id, p_customer_id, 'payment', v_delivery_id, 'credit', p_amount_collected, auth.uid());
    END IF;

    -- 5. Update Jar State (Transactionally locked)
    IF p_jars_delivered > 0 OR p_jars_returned > 0 THEN
        -- Lock the row to prevent race conditions
        SELECT jars_with_customer INTO v_current_jar_balance 
        FROM public.customer_jar_balances 
        WHERE supplier_customer_id = p_customer_id 
        FOR UPDATE;

        IF (v_current_jar_balance + p_jars_delivered - p_jars_returned) < 0 THEN
            RAISE EXCEPTION 'Negative jar balance constraint violation';
        END IF;

        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, jars_delivered, jars_returned)
        VALUES (p_customer_id, v_delivery_id, p_jars_delivered, p_jars_returned);
        
        UPDATE public.customer_jar_balances
        SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
        WHERE supplier_customer_id = p_customer_id;

        -- Update Supplier Inventory logic
        UPDATE public.supplier_inventory
        SET available = available - p_jars_delivered + p_jars_returned,
            with_customers = with_customers + p_jars_delivered - p_jars_returned
        WHERE supplier_id = v_supplier_id;
        
        IF p_jars_delivered > 0 THEN
            INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
            VALUES (v_supplier_id, 'delivery', v_delivery_id, -p_jars_delivered);
        END IF;
        
        IF p_jars_returned > 0 THEN
            INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
            VALUES (v_supplier_id, 'return', v_delivery_id, p_jars_returned);
        END IF;
    END IF;

    -- 6. Advance Recurring Schedule
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = v_today + interval_days
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id
    AND is_active = true;

    RETURN v_delivery_id;
END;
$$;


ALTER FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_price" numeric, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_delivery_id UUID;
    v_total_amount NUMERIC(10,2);
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    -- Verify ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    v_total_amount := p_quantity * p_price;

    -- 1. Create Delivery Record
    INSERT INTO public.deliveries (
        supplier_id, supplier_customer_id, status, delivery_date, total_amount
    ) VALUES (
        v_supplier_id, p_customer_id, 'delivered', CURRENT_DATE, v_total_amount
    ) RETURNING id INTO v_delivery_id;

    INSERT INTO public.delivery_items (
        delivery_id, supplier_product_id, quantity, unit_price, total_price
    ) VALUES (
        v_delivery_id, p_supplier_product_id, p_quantity, p_price, v_total_amount
    );

    -- 2. Process Jars Delivered
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, transaction_type, quantity, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_customer_id, 'delivered_to_customer', p_jars_delivered, v_delivery_id, p_jars_delivered, 0
        );
        
        -- Update Inventory
        UPDATE public.supplier_inventory 
        SET available = available - p_jars_delivered, updated_at = NOW()
        WHERE supplier_id = v_supplier_id;
    END IF;

    -- 3. Process Jars Returned
    IF p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, transaction_type, quantity, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_customer_id, 'returned_by_customer', p_jars_returned, v_delivery_id, 0, p_jars_returned
        );
        
        -- Update Inventory
        UPDATE public.supplier_inventory 
        SET available = available + p_jars_returned, updated_at = NOW()
        WHERE supplier_id = v_supplier_id;
    END IF;

    -- Update Customer Jar Balance
    INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
    VALUES (p_customer_id, p_jars_delivered - p_jars_returned)
    ON CONFLICT (supplier_customer_id) 
    DO UPDATE SET 
        jars_with_customer = public.customer_jar_balances.jars_with_customer + p_jars_delivered - p_jars_returned,
        updated_at = NOW();

    -- 4. Process Payment Collection
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (
            supplier_id, supplier_customer_id, delivery_id, amount, payment_method
        ) VALUES (
            v_supplier_id, p_customer_id, v_delivery_id, p_amount_collected, p_payment_method
        );
    END IF;

    -- 5. Update Schedule (push next delivery date if applicable)
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = CURRENT_DATE + interval_days
    WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id;

    RETURN v_delivery_id;
END;
$$;


ALTER FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_price" numeric, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_delivery_schedule"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_interval_days" integer, "p_first_delivery_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Upsert schedule
    IF EXISTS (SELECT 1 FROM public.customer_delivery_schedules WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id) THEN
        UPDATE public.customer_delivery_schedules 
        SET quantity = p_quantity,
            interval_days = p_interval_days,
            next_delivery_date = p_first_delivery_date,
            is_active = true,
            updated_at = NOW()
        WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id;
    ELSE
        INSERT INTO public.customer_delivery_schedules (
            supplier_customer_id, supplier_product_id, quantity, interval_days, next_delivery_date, is_active
        ) VALUES (
            p_customer_id, p_supplier_product_id, p_quantity, p_interval_days, p_first_delivery_date, true
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."create_delivery_schedule"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_interval_days" integer, "p_first_delivery_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_normalized_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not a supplier'; END IF;

    INSERT INTO public.supplier_customers (
        supplier_id, name, phone, normalized_phone, customer_type, address, sector
    ) VALUES (
        v_supplier_id, p_name, p_phone, p_normalized_phone, p_customer_type, p_address, p_sector
    ) RETURNING id INTO v_customer_id;

    -- Initialize jar balance to 0
    INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
    VALUES (v_customer_id, 0);

    RETURN v_customer_id;
END;
$$;


ALTER FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_normalized_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_customer_type" "public"."customer_type_enum" DEFAULT 'household'::"public"."customer_type_enum", "p_address" "text" DEFAULT NULL::"text", "p_sector" "text" DEFAULT NULL::"text", "p_landmark" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    INSERT INTO public.supplier_customers (
        supplier_id, name, phone, normalized_phone, customer_type, address, sector, landmark, notes
    ) VALUES (
        v_supplier_id, p_name, p_phone, p_phone, p_customer_type, p_address, p_sector, p_landmark, p_notes
    ) RETURNING id INTO v_customer_id;
    
    RETURN v_customer_id;
END;
$$;


ALTER FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text", "p_landmark" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_daily_run"("p_supplier_id" "uuid", "p_run_date" "date", "p_vehicle_id" "uuid", "p_driver_id" "uuid", "p_schedule_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_daily_run"("p_supplier_id" "uuid", "p_run_date" "date", "p_vehicle_id" "uuid", "p_driver_id" "uuid", "p_schedule_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_display_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.display_id = 'AK-' || to_char(timezone('Asia/Kolkata', now()), 'YYYY') || '-' || lpad(nextval('order_display_seq')::text, 6, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_order_display_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_customer_network_view"() RETURNS TABLE("sector" "text", "customer_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        COALESCE(sc.sector, 'Unassigned') AS sector,
        COUNT(sc.id)::BIGINT AS customer_count
    FROM public.supplier_customers sc
    GROUP BY COALESCE(sc.sector, 'Unassigned')
    ORDER BY customer_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_admin_customer_network_view"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_network_capacity"() RETURNS TABLE("supplier_name" "text", "sector" "text", "total_capacity" integer, "reserved_capacity" integer, "remaining_capacity" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        s.business_name AS supplier_name,
        COALESCE(s.address, 'Unassigned') AS sector,
        sc.max_capacity AS total_capacity,
        (sc.reserved_quantity + sc.fulfilled_quantity) AS reserved_capacity,
        (sc.max_capacity - (sc.reserved_quantity + sc.fulfilled_quantity)) AS remaining_capacity
    FROM public.suppliers s
    JOIN public.supplier_capacity sc ON sc.supplier_id = s.id
    WHERE sc.date = current_date
    ORDER BY remaining_capacity DESC;
END;
$$;


ALTER FUNCTION "public"."get_admin_network_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_network_overview"() RETURNS TABLE("total_suppliers" bigint, "active_suppliers" bigint, "total_customers" bigint, "orders_today" bigint, "deliveries_today" bigint, "pending_orders" bigint, "jars_in_network" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.suppliers)::BIGINT AS total_suppliers,
        (SELECT COUNT(*) FROM public.suppliers WHERE is_active = true)::BIGINT AS active_suppliers,
        (SELECT COUNT(id) FROM public.supplier_customers)::BIGINT AS total_customers,
        (SELECT COUNT(*) FROM public.orders WHERE DATE(created_at AT TIME ZONE 'UTC') = current_date)::BIGINT AS orders_today,
        (SELECT COUNT(*) FROM public.deliveries WHERE DATE(delivery_date AT TIME ZONE 'UTC') = current_date AND status = 'completed')::BIGINT AS deliveries_today,
        (SELECT COUNT(*) FROM public.orders WHERE status IN ('placed', 'accepted', 'preparing', 'out_for_delivery'))::BIGINT AS pending_orders,
        (SELECT COALESCE(SUM(jars_with_customer), 0) FROM public.customer_jar_balances)::BIGINT AS jars_in_network;
END;
$$;


ALTER FUNCTION "public"."get_admin_network_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_operational_alerts"() RETURNS TABLE("alert_type" "text", "severity" "text", "entity_id" "uuid", "entity_name" "text", "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Alert 1: Suppliers near capacity (>90%)
    RETURN QUERY
    SELECT 
        'capacity_warning'::TEXT AS alert_type,
        'high'::TEXT AS severity,
        s.id AS entity_id,
        s.business_name AS entity_name,
        'Supplier is operating at ' || ROUND(((cap.reserved_quantity + cap.fulfilled_quantity)::NUMERIC / NULLIF(cap.max_capacity, 0)) * 100, 1) || '% capacity' AS message
    FROM public.suppliers s
    JOIN public.supplier_capacity cap ON cap.supplier_id = s.id AND cap.date = current_date
    WHERE cap.max_capacity > 0 
      AND ((cap.reserved_quantity + cap.fulfilled_quantity)::NUMERIC / cap.max_capacity) >= 0.9
      AND s.is_active = true;

    -- Alert 2: Inactive suppliers with pending orders
    RETURN QUERY
    SELECT 
        'inactive_with_orders'::TEXT AS alert_type,
        'critical'::TEXT AS severity,
        s.id AS entity_id,
        s.business_name AS entity_name,
        'Supplier is inactive but has ' || COUNT(o.id) || ' pending orders' AS message
    FROM public.suppliers s
    JOIN public.orders o ON o.supplier_id = s.id
    WHERE s.is_active = false 
      AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery')
    GROUP BY s.id, s.business_name;

    -- Alert 3: Potential demand-capacity gap by sector
    RETURN QUERY
    WITH sector_demand AS (
        SELECT COALESCE(sc.sector, 'Unassigned') AS sector, COUNT(sc.id) AS demand
        FROM public.supplier_customers sc
        GROUP BY COALESCE(sc.sector, 'Unassigned')
    ),
    sector_capacity AS (
        SELECT COALESCE(s.address, 'Unassigned') AS sector, SUM(cap.max_capacity) AS total_cap
        FROM public.supplier_capacity cap
        JOIN public.suppliers s ON s.id = cap.supplier_id
        WHERE s.is_active = true AND cap.date = current_date
        GROUP BY COALESCE(s.address, 'Unassigned')
    )
    SELECT 
        'sector_capacity_gap'::TEXT AS alert_type,
        'medium'::TEXT AS severity,
        NULL::UUID AS entity_id,
        sd.sector AS entity_name,
        'Sector demand (' || sd.demand || ' customers) may exceed active supplier capacity (' || COALESCE(sc.total_cap, 0) || ' jars)' AS message
    FROM sector_demand sd
    LEFT JOIN sector_capacity sc ON sc.sector = sd.sector
    WHERE COALESCE(sc.total_cap, 0) < sd.demand * 2; -- Heuristic: Assume ~2 jars per customer max
END;
$$;


ALTER FUNCTION "public"."get_admin_operational_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_orders"("p_date" "date" DEFAULT CURRENT_DATE, "p_supplier_id" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT NULL::"text", "p_sector" "text" DEFAULT NULL::"text") RETURNS TABLE("order_id" "uuid", "display_id" "text", "customer_name" "text", "supplier_name" "text", "sector" "text", "status" "text", "created_at" timestamp with time zone, "total_amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        o.id AS order_id,
        o.display_id,
        p.name AS customer_name,
        s.business_name AS supplier_name,
        'Unassigned'::TEXT AS sector,
        o.status,
        o.created_at,
        o.total AS total_amount
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.customer_id
    JOIN public.suppliers s ON s.id = o.supplier_id
    LEFT JOIN public.addresses a ON a.id = o.address_id
    WHERE DATE(o.created_at AT TIME ZONE 'UTC') = p_date
      AND (p_supplier_id IS NULL OR o.supplier_id = p_supplier_id)
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_sector IS NULL OR 'Unassigned' = p_sector)
    ORDER BY o.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_admin_orders"("p_date" "date", "p_supplier_id" "uuid", "p_status" "text", "p_sector" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_suppliers_list"() RETURNS TABLE("supplier_id" "uuid", "business_name" "text", "area" "text", "status" "text", "capacity" integer, "active_customers" bigint, "orders_today" bigint, "fulfillment_rate" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    WITH supplier_stats AS (
        SELECT 
            s.id,
            COUNT(DISTINCT c.id) AS active_customers,
            COUNT(DISTINCT o.id) AS orders_today,
            COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) AS fulfilled_orders
        FROM public.suppliers s
        LEFT JOIN public.supplier_customers c ON c.supplier_id = s.id AND c.is_active = true
        LEFT JOIN public.orders o ON o.supplier_id = s.id AND DATE(o.created_at AT TIME ZONE 'UTC') = current_date
        GROUP BY s.id
    )
    SELECT 
        s.id AS supplier_id,
        s.business_name,
        COALESCE(s.address, 'Unassigned') AS area,
        CASE 
            WHEN s.is_active AND s.is_verified THEN 'Active'
            WHEN s.is_active AND NOT s.is_verified THEN 'Pending Verification'
            ELSE 'Inactive'
        END AS status,
        COALESCE(cap.max_capacity, 0) AS capacity,
        COALESCE(st.active_customers, 0)::BIGINT AS active_customers,
        COALESCE(st.orders_today, 0)::BIGINT AS orders_today,
        CASE 
            WHEN st.orders_today > 0 THEN ROUND((st.fulfilled_orders::NUMERIC / st.orders_today::NUMERIC) * 100, 2)
            ELSE 0 
        END AS fulfillment_rate
    FROM public.suppliers s
    LEFT JOIN public.supplier_capacity cap ON cap.supplier_id = s.id AND cap.date = current_date
    LEFT JOIN supplier_stats st ON st.id = s.id
    ORDER BY s.business_name ASC;
END;
$$;


ALTER FUNCTION "public"."get_admin_suppliers_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_suppliers"("p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision) RETURNS TABLE("id" "uuid", "profile_id" "uuid", "business_name" "text", "description" "text", "phone" "text", "address" "text", "lat" double precision, "lng" double precision, "is_accepting_orders" boolean, "distance" double precision, "distance_km" double precision, "price" numeric, "available_quantity" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    RETURN QUERY
    SELECT s.id, s.profile_id, s.business_name, s.description, s.phone, s.address, s.lat, s.lng, s.is_accepting_orders,
           COALESCE(
               (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))), 
           0) as distance,
           COALESCE(
               (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))), 
           0) as distance_km,
           COALESCE(
               -- Try to get custom price for this customer and supplier
               (
                   SELECT cpp.price 
                   FROM public.customer_product_prices cpp
                   JOIN public.supplier_customers sc ON cpp.supplier_customer_id = sc.id
                   WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id
                   AND cpp.supplier_product_id = (SELECT sp.id FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
                   AND cpp.effective_until IS NULL
                   LIMIT 1
               ),
               -- Fallback to public price
               (SELECT sp.price FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
           ) as price,
           (SELECT (
               COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = s.id ORDER BY date DESC LIMIT 1), 0)
               - COALESCE(sc.reserved_quantity, 0) 
               - COALESCE(sc.fulfilled_quantity, 0)
           ) 
           FROM public.suppliers dummy 
           LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date 
           WHERE dummy.id = s.id LIMIT 1) as available_quantity
    FROM public.suppliers s
    WHERE s.is_active = true 
    AND s.is_verified = true 
    AND s.is_accepting_orders = true
    AND EXISTS (
        SELECT 1 FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true
    )
    AND (SELECT (
           COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = s.id ORDER BY date DESC LIMIT 1), 0)
           - COALESCE(sc.reserved_quantity, 0) 
           - COALESCE(sc.fulfilled_quantity, 0)
       ) 
       FROM public.suppliers dummy 
       LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date 
       WHERE dummy.id = s.id LIMIT 1) > 0
    ORDER BY distance ASC;
END;
$$;


ALTER FUNCTION "public"."get_available_suppliers"("p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_ledger"("p_customer_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_outstanding NUMERIC;
    v_entries JSON;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Calculate outstanding
    SELECT 
        COALESCE((SELECT SUM(total_amount) FROM public.deliveries WHERE supplier_customer_id = p_customer_id), 0)
        - 
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE supplier_customer_id = p_customer_id), 0)
    INTO v_outstanding;

    -- Get entries (combining deliveries and payments)
    WITH combined_entries AS (
        SELECT 
            id,
            'delivery' AS reference_type,
            'debit' AS entry_type,
            total_amount AS amount,
            created_at
        FROM public.deliveries 
        WHERE supplier_customer_id = p_customer_id

        UNION ALL

        SELECT 
            id,
            'payment' AS reference_type,
            'credit' AS entry_type,
            amount,
            created_at
        FROM public.payments
        WHERE supplier_customer_id = p_customer_id
    )
    SELECT json_agg(row_to_json(e)) INTO v_entries
    FROM (
        SELECT * FROM combined_entries ORDER BY created_at DESC LIMIT 100
    ) e;

    RETURN json_build_object(
        'outstanding_balance', v_outstanding,
        'entries', COALESCE(v_entries, '[]'::json)
    );
END;
$$;


ALTER FUNCTION "public"."get_customer_ledger"("p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_effective_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_price NUMERIC(10,2);
BEGIN
    -- 1. Try to find active custom price
    SELECT price INTO v_price
    FROM public.customer_product_prices
    WHERE supplier_customer_id = p_customer_id
    AND supplier_product_id = p_supplier_product_id
    AND effective_until IS NULL;

    -- 2. If no custom price, fallback to default product price
    IF v_price IS NULL THEN
        SELECT price INTO v_price
        FROM public.supplier_products
        WHERE id = p_supplier_product_id;
    END IF;

    -- 3. Safety check
    IF v_price IS NULL THEN
        RAISE EXCEPTION 'Price resolution failed: Product not found';
    END IF;

    RETURN v_price;
END;
$$;


ALTER FUNCTION "public"."get_effective_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_jar_activity"("p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "customer_name" "text", "jars_delivered" integer, "jars_returned" integer, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    SELECT 
        jt.id,
        c.name AS customer_name,
        CASE WHEN jt.transaction_type = 'delivered_to_customer' THEN jt.quantity ELSE 0 END AS jars_delivered,
        CASE WHEN jt.transaction_type = 'returned_by_customer' THEN jt.quantity ELSE 0 END AS jars_returned,
        jt.created_at
    FROM public.jar_transactions jt
    JOIN public.supplier_customers c ON c.id = jt.supplier_customer_id
    WHERE c.supplier_id = v_supplier_id
      AND jt.transaction_type IN ('delivered_to_customer', 'returned_by_customer')
    ORDER BY jt.created_at DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_jar_activity"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_network_health_risks"() RETURNS TABLE("supplier_id" "uuid", "business_name" "text", "total_forecast" integer, "current_inventory" integer, "shortfall" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

    RETURN QUERY
    SELECT 
        f.supplier_id,
        f.business_name,
        f.total_forecast,
        f.current_inventory,
        f.shortfall
    FROM public.suppliers s
    CROSS JOIN LATERAL public.get_supplier_forecast(s.id) f
    WHERE s.is_active = true 
    AND f.is_at_risk = true
    ORDER BY f.shortfall DESC;
END;
$$;


ALTER FUNCTION "public"."get_network_health_risks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reassignment_candidates"("p_order_id" "uuid") RETURNS TABLE("supplier_id" "uuid", "business_name" "text", "capacity" integer, "remaining_capacity" integer, "distance_km" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order_sector TEXT;
    v_order_qty INT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Get order details
    SELECT a.sector, COALESCE((SELECT SUM(quantity) FROM public.order_items WHERE order_id = p_order_id), 0)
    INTO v_order_sector, v_order_qty
    FROM public.orders o
    JOIN public.addresses a ON a.id = o.address_id
    WHERE o.id = p_order_id;

    RETURN QUERY
    SELECT 
        s.id AS supplier_id,
        s.business_name,
        cap.max_capacity AS capacity,
        (cap.max_capacity - (cap.reserved_quantity + cap.fulfilled_quantity)) AS remaining_capacity,
        0.0::NUMERIC AS distance_km -- Mocked for now, pending geo-routing
    FROM public.suppliers s
    JOIN public.supplier_capacity cap ON cap.supplier_id = s.id AND cap.date = current_date
    WHERE s.is_active = true 
      AND s.is_accepting_orders = true
      AND s.address = v_order_sector
      AND (cap.max_capacity - (cap.reserved_quantity + cap.fulfilled_quantity)) >= v_order_qty
      AND s.id != (SELECT supplier_id FROM public.orders WHERE id = p_order_id)
    ORDER BY remaining_capacity DESC;
END;
$$;


ALTER FUNCTION "public"."get_reassignment_candidates"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_current_capacity"("p_supplier_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_capacity INT;
BEGIN
    v_supplier_id := COALESCE(p_supplier_id, public.get_supplier_id());
    
    -- 1. Try to get the capacity explicitly for this supplier
    SELECT sc.max_capacity INTO v_capacity
    FROM public.supplier_capacity sc
    WHERE sc.supplier_id = v_supplier_id AND sc.date = timezone('Asia/Kolkata', now())::date
    LIMIT 1;

    -- 2. If not found (e.g. they got a new session ID), fetch the latest capacity ANY supplier set today
    IF v_capacity IS NULL THEN
        SELECT max_capacity INTO v_capacity
        FROM public.supplier_capacity 
        WHERE date = timezone('Asia/Kolkata', now())::date
        ORDER BY created_at DESC 
        LIMIT 1;
    END IF;

    -- 3. If STILL null, fallback to the last recorded capacity for this supplier on any day
    IF v_capacity IS NULL THEN
        SELECT max_capacity INTO v_capacity 
        FROM public.supplier_capacity 
        WHERE supplier_id = v_supplier_id 
        ORDER BY date DESC 
        LIMIT 1;
    END IF;

    RETURN COALESCE(v_capacity, 0);
END;
$$;


ALTER FUNCTION "public"."get_supplier_current_capacity"("p_supplier_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_customers"("p_search" "text" DEFAULT NULL::"text", "p_customer_type" "public"."customer_type_enum" DEFAULT NULL::"public"."customer_type_enum", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "phone" "text", "customer_type" "public"."customer_type_enum", "address" "text", "sector" "text", "is_active" boolean, "active_price" numeric, "jar_balance" integer, "next_due_date" "date", "outstanding_balance" numeric, "last_delivery_at" timestamp with time zone, "schedule_active" boolean, "schedule_quantity" integer, "schedule_interval" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.phone,
        c.customer_type,
        c.address,
        c.sector,
        c.is_active,
        cp.price AS active_price,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance,
        s.next_delivery_date AS next_due_date,
        (
            -- Deliveries cost money (increase outstanding)
            COALESCE((SELECT SUM(total_amount) FROM public.deliveries d WHERE d.supplier_customer_id = c.id), 0)
            - 
            -- Payments reduce outstanding
            COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.supplier_customer_id = c.id), 0)
        ) AS outstanding_balance,
        (
            SELECT MAX(created_at) FROM public.deliveries d WHERE d.supplier_customer_id = c.id
        ) AS last_delivery_at,
        s.is_active AS schedule_active,
        s.quantity AS schedule_quantity,
        s.interval_days AS schedule_interval
    FROM public.supplier_customers c
    LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    LEFT JOIN public.customer_delivery_schedules s ON s.supplier_customer_id = c.id
    WHERE c.supplier_id = v_supplier_id
      AND (p_search IS NULL OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
      AND (p_customer_type IS NULL OR c.customer_type = p_customer_type)
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_supplier_customers"("p_search" "text", "p_customer_type" "public"."customer_type_enum", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_details_for_customer"("p_supplier_id" "uuid") RETURNS TABLE("id" "uuid", "profile_id" "uuid", "business_name" "text", "description" "text", "phone" "text", "address" "text", "is_accepting_orders" boolean, "price" numeric, "available_quantity" integer, "supplier_product_id" "uuid", "product_id" "uuid", "product_name" "text", "supplier_customer_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    RETURN QUERY
    SELECT 
        s.id, 
        s.profile_id, 
        s.business_name, 
        s.description, 
        s.phone, 
        s.address, 
        s.is_accepting_orders,
        COALESCE(
            (
                SELECT cpp.price 
                FROM public.customer_product_prices cpp
                JOIN public.supplier_customers sc ON cpp.supplier_customer_id = sc.id
                WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id
                AND cpp.supplier_product_id = sp.id
                AND cpp.effective_until IS NULL
                LIMIT 1
            ),
            sp.price
        ) as price,
        (SELECT (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) FROM public.supplier_capacity sc WHERE sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date LIMIT 1) as available_quantity,
        sp.id as supplier_product_id,
        p.id as product_id,
        p.name as product_name,
        (SELECT sc.id FROM public.supplier_customers sc WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id LIMIT 1) as supplier_customer_id
    FROM public.suppliers s
    JOIN public.supplier_products sp ON sp.supplier_id = s.id
    JOIN public.products p ON p.id = sp.product_id
    WHERE s.id = p_supplier_id
    LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_supplier_details_for_customer"("p_supplier_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_forecast"("p_supplier_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("supplier_id" "uuid", "business_name" "text", "scheduled_demand" integer, "avg_marketplace_demand" integer, "total_forecast" integer, "current_inventory" integer, "shortfall" integer, "is_at_risk" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
    v_seven_days_ago DATE := CURRENT_DATE - INTERVAL '7 days';
BEGIN
    -- If p_supplier_id is null, assume it's the supplier calling for their own dashboard
    IF p_supplier_id IS NULL THEN
        v_supplier_id := public.get_supplier_id();
    ELSE
        v_supplier_id := p_supplier_id;
    END IF;

    RETURN QUERY
    WITH tomorrow_schedules AS (
        SELECT COALESCE(SUM(quantity), 0)::INT AS demand
        FROM public.customer_delivery_schedules
        WHERE supplier_customer_id IN (SELECT sc.id FROM public.supplier_customers sc WHERE sc.supplier_id = v_supplier_id)
        AND is_active = true
        AND next_delivery_date = v_tomorrow
    ),
    historical_orders AS (
        SELECT COALESCE(SUM(oi.quantity) / 7.0, 0)::INT AS avg_demand
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.supplier_id = v_supplier_id
        AND o.status = 'delivered'
        AND timezone('Asia/Kolkata', o.created_at)::date >= v_seven_days_ago
        AND timezone('Asia/Kolkata', o.created_at)::date < CURRENT_DATE
    ),
    inventory AS (
        SELECT COALESCE(available, 0)::INT AS jars
        FROM public.supplier_inventory si
        WHERE si.supplier_id = v_supplier_id
    )
    SELECT 
        s.id AS supplier_id,
        s.business_name,
        ts.demand AS scheduled_demand,
        ho.avg_demand AS avg_marketplace_demand,
        (ts.demand + ho.avg_demand) AS total_forecast,
        inv.jars AS current_inventory,
        GREATEST(0, (ts.demand + ho.avg_demand) - inv.jars) AS shortfall,
        ((ts.demand + ho.avg_demand) > inv.jars) AS is_at_risk
    FROM public.suppliers s,
         tomorrow_schedules ts,
         historical_orders ho,
         inventory inv
    WHERE s.id = v_supplier_id;
END;
$$;


ALTER FUNCTION "public"."get_supplier_forecast"("p_supplier_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN (SELECT id FROM public.suppliers WHERE profile_id = auth.uid());
END;
$$;


ALTER FUNCTION "public"."get_supplier_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_inventory_stats"() RETURNS TABLE("owned" integer, "available" integer, "with_customers" integer, "damaged" integer, "missing" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    SELECT 
        COALESCE(i.owned, 0) AS owned,
        COALESCE(i.available, 0) AS available,
        COALESCE(
            (SELECT SUM(jb.jars_with_customer) 
             FROM public.customer_jar_balances jb 
             JOIN public.supplier_customers c ON c.id = jb.supplier_customer_id 
             WHERE c.supplier_id = v_supplier_id), 0
        )::INT AS with_customers,
        COALESCE(i.damaged, 0) AS damaged,
        COALESCE(i.missing, 0) AS missing
    FROM public.supplier_inventory i
    WHERE i.supplier_id = v_supplier_id;
END;
$$;


ALTER FUNCTION "public"."get_supplier_inventory_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_today"() RETURNS TABLE("deliveries_due" integer, "jars_required" integer, "expected_revenue" numeric, "deliveries_done" integer, "billed_today" numeric, "collected_today" numeric, "outstanding_total" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    WITH due_schedules AS (
        SELECT 
            s.quantity,
            COALESCE(cp.price, sp.price) AS price
        FROM public.customer_delivery_schedules s
        JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
        JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
        LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
        WHERE c.supplier_id = v_supplier_id 
          AND s.is_active = true 
          AND s.next_delivery_date <= CURRENT_DATE
    ),
    live_orders AS (
        SELECT 
            oi.quantity,
            oi.unit_price AS price
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.supplier_id = v_supplier_id 
          AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery')
          -- REMOVED timezone date check so active orders always appear!
    ),
    todays_deliveries AS (
        SELECT 
            di.quantity, 
            d.total_amount,
            (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE delivery_id = d.id) AS collected
        FROM public.deliveries d
        LEFT JOIN public.delivery_items di ON di.delivery_id = d.id
        WHERE d.supplier_id = v_supplier_id 
          AND d.delivery_date = CURRENT_DATE
          AND d.status = 'delivered'
    ),
    total_outstanding AS (
        SELECT COALESCE(SUM(balance), 0) AS amt
        FROM public.customer_ledger
        WHERE supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = v_supplier_id)
    )
    SELECT 
        (SELECT COUNT(*)::INT FROM due_schedules) + (SELECT COUNT(*)::INT FROM live_orders) AS deliveries_due,
        (SELECT COALESCE(SUM(quantity), 0)::INT FROM due_schedules) + (SELECT COALESCE(SUM(quantity), 0)::INT FROM live_orders) AS jars_required,
        (SELECT COALESCE(SUM(quantity * price), 0) FROM due_schedules) + (SELECT COALESCE(SUM(quantity * price), 0) FROM live_orders) AS expected_revenue,
        (SELECT COUNT(*)::INT FROM todays_deliveries) AS deliveries_done,
        (SELECT COALESCE(SUM(total_amount), 0) FROM todays_deliveries) AS billed_today,
        (SELECT COALESCE(SUM(collected), 0) FROM todays_deliveries) AS collected_today,
        (SELECT amt FROM total_outstanding) AS outstanding_total;
END;
$$;


ALTER FUNCTION "public"."get_supplier_today"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_today_manifest"() RETURNS TABLE("customer_id" "uuid", "customer_name" "text", "customer_type" "public"."customer_type_enum", "phone" "text", "address" "text", "sector" "text", "supplier_product_id" "uuid", "quantity" integer, "effective_unit_price" numeric, "expected_amount" numeric, "jar_balance_before" integer, "next_delivery_date" "date", "source" "text", "order_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    -- 1. Scheduled CRM Deliveries
    SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.customer_type,
        c.phone,
        c.address,
        c.sector,
        s.supplier_product_id,
        s.quantity,
        COALESCE(cp.price, sp.price) AS effective_unit_price,
        (s.quantity * COALESCE(cp.price, sp.price)) AS expected_amount,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance_before,
        s.next_delivery_date,
        'scheduled'::TEXT AS source,
        NULL::UUID AS order_id,
        'scheduled'::TEXT AS status
    FROM public.customer_delivery_schedules s
    JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
    JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
    LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE c.supplier_id = v_supplier_id 
      AND s.is_active = true 
      AND s.next_delivery_date <= CURRENT_DATE

    UNION ALL

    -- 2. Live Marketplace Orders
    SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.customer_type,
        c.phone,
        COALESCE(c.address, addr.address) AS address,
        c.sector,
        sp.id AS supplier_product_id,
        oi.quantity,
        oi.unit_price AS effective_unit_price,
        (oi.quantity * oi.unit_price) AS expected_amount,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance_before,
        CURRENT_DATE AS next_delivery_date,
        'marketplace'::TEXT AS source,
        o.id AS order_id,
        o.status::TEXT AS status
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.supplier_customers c ON c.user_id = o.customer_id AND c.supplier_id = o.supplier_id
    JOIN public.supplier_products sp ON sp.product_id = oi.product_id AND sp.supplier_id = o.supplier_id
    LEFT JOIN public.addresses addr ON addr.id = o.address_id
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE o.supplier_id = v_supplier_id 
      AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery');
END;
$$;


ALTER FUNCTION "public"."get_today_manifest"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.profiles (id, name, phone, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'Unknown User'),
        NEW.phone,
        NEW.email,
        'customer'
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN (
        auth.jwt() ->> 'email' = 'amritdhara@aquakart.com' OR 
        auth.jwt() ->> 'email' = 'admin@aquakart.com' OR
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
        public.get_user_role() = 'admin'
    );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_customer_arrival"("p_stop_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_run_id UUID;
    v_customer_id UUID;
    v_supplier_id UUID;
    v_title TEXT := 'Your Delivery is Arriving Soon!';
    v_body TEXT := 'Our delivery vehicle is nearby and will arrive shortly.';
BEGIN
    -- Verify the caller is a supplier and get context
    SELECT r.supplier_id INTO v_supplier_id
    FROM public.delivery_runs r
    JOIN public.delivery_run_stops s ON s.run_id = r.id
    WHERE s.id = p_stop_id;

    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Stop not found';
    END IF;

    -- Only allow if the caller is the supplier OR an active driver for this supplier
    IF (v_supplier_id != public.get_supplier_id()) THEN
        IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE supplier_id = v_supplier_id AND profile_id = auth.uid() AND is_active = true) THEN
            RAISE EXCEPTION 'Not authorized to send alerts for this stop';
        END IF;
    END IF;

    -- Get customer ID
    SELECT customer_id INTO v_customer_id
    FROM public.delivery_run_stops
    WHERE id = p_stop_id;

    -- Update stop status to indicate en_route or that alert was sent
    UPDATE public.delivery_run_stops
    SET status = 'en_route',
        arrival_alert_sent_at = now(),
        updated_at = now()
    WHERE id = p_stop_id;

    -- Insert into delivery_notifications to trigger the Push Notification Webhook
    INSERT INTO public.delivery_notifications (
        user_id,
        stop_id,
        notification_type,
        title,
        body,
        status,
        scheduled_for
    ) VALUES (
        v_customer_id,
        p_stop_id,
        'eta_alert',
        v_title,
        v_body,
        'pending',
        now()
    );

END;
$$;


ALTER FUNCTION "public"."notify_customer_arrival"("p_stop_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_customer_arrival_by_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_customer_id UUID;
    v_supplier_id UUID;
    v_title TEXT := 'Your Delivery is Arriving Soon!';
    v_body TEXT := 'Our delivery vehicle is nearby and will arrive shortly.';
BEGIN
    -- Get order details
    SELECT customer_id, supplier_id INTO v_customer_id, v_supplier_id
    FROM public.orders
    WHERE id = p_order_id;

    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Only allow if the caller is the supplier
    IF (v_supplier_id != public.get_supplier_id()) THEN
        RAISE EXCEPTION 'Not authorized to send alerts for this order';
    END IF;

    -- Insert into delivery_notifications to trigger the Push Notification Webhook
    INSERT INTO public.delivery_notifications (
        user_id,
        order_id,
        notification_type,
        title,
        body,
        status,
        scheduled_for
    ) VALUES (
        v_customer_id,
        p_order_id,
        'eta_alert',
        v_title,
        v_body,
        'pending',
        now()
    );
END;
$$;


ALTER FUNCTION "public"."notify_customer_arrival_by_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order_id UUID;
    v_user_id UUID;
    v_supplier_customer_id UUID;
    v_unit_price NUMERIC(10,2);
    v_subtotal NUMERIC(10,2);
    v_delivery_fee NUMERIC(10,2) := 0;
    v_supplier_product_id UUID;
    v_available_capacity INT;
    v_customer_profile RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Map marketplace customer to Supplier CRM (Create if doesn't exist)
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
    WHERE user_id = v_user_id AND supplier_id = p_supplier_id;

    IF v_supplier_customer_id IS NULL THEN
        -- Get user profile details to populate CRM
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_user_id;
        
        INSERT INTO public.supplier_customers (supplier_id, user_id, name, phone, customer_type, address, sector)
        VALUES (
            p_supplier_id, 
            v_user_id, 
            v_customer_profile.full_name, 
            v_customer_profile.phone, 
            'individual', 
            '', 
            ''
        ) RETURNING id INTO v_supplier_customer_id;
    END IF;

    -- Validate product and get supplier_product_id
    SELECT id INTO v_supplier_product_id 
    FROM public.supplier_products 
    WHERE supplier_id = p_supplier_id AND product_id = p_product_id AND available = true;
    
    IF v_supplier_product_id IS NULL THEN RAISE EXCEPTION 'Product not available from this supplier'; END IF;

    -- Check Capacity First
    SELECT (max_capacity - reserved_quantity - fulfilled_quantity) INTO v_available_capacity 
    FROM public.supplier_capacity 
    WHERE supplier_id = p_supplier_id AND date = timezone('Asia/Kolkata', now())::date;

    IF COALESCE(v_available_capacity, 0) < p_quantity THEN 
        RAISE EXCEPTION 'Insufficient supplier capacity for this order'; 
    END IF;

    -- Resolve secure price
    v_unit_price := public.get_effective_customer_price(v_supplier_customer_id, v_supplier_product_id);
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Could not resolve pricing'; END IF;

    v_subtotal := v_unit_price * p_quantity;

    -- Insert Order
    INSERT INTO public.orders (customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status)
    VALUES (v_user_id, p_supplier_id, p_address_id, 'placed', v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee, p_payment_method, 'pending')
    RETURNING id INTO v_order_id;

    -- Insert Order Items
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, p_product_id, p_quantity, v_unit_price, v_subtotal);

    -- Track history
    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'placed', v_user_id);

    RETURN v_order_id;
END;
$$;


ALTER FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text", "p_idempotency_key" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order_id UUID;
    v_user_id UUID;
    v_supplier_customer_id UUID;
    v_unit_price NUMERIC(10,2);
    v_subtotal NUMERIC(10,2);
    v_delivery_fee NUMERIC(10,2) := 0;
    v_supplier_product_id UUID;
    v_available_capacity INT;
    v_customer_profile RECORD;
    v_existing_payload JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_existing_payload 
        FROM public.api_idempotency 
        WHERE idempotency_key = p_idempotency_key AND user_id = v_user_id;

        IF v_existing_payload IS NOT NULL THEN
            RETURN (v_existing_payload->>'order_id')::UUID;
        END IF;
    END IF;

    -- Map marketplace customer to Supplier CRM
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
    WHERE user_id = v_user_id AND supplier_id = p_supplier_id;

    IF v_supplier_customer_id IS NULL THEN
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_user_id;
        
        INSERT INTO public.supplier_customers (
            supplier_id, user_id, name, phone, normalized_phone, customer_type, address, sector
        )
        VALUES (
            p_supplier_id, 
            v_user_id, 
            COALESCE(v_customer_profile.name, 'Customer'), 
            v_customer_profile.phone, 
            COALESCE(RIGHT(REGEXP_REPLACE(v_customer_profile.phone, '\D', '', 'g'), 10), '0000000000'), 
            'household', 
            '', 
            ''
        ) RETURNING id INTO v_supplier_customer_id;
    END IF;

    -- Validate product and get supplier_product_id
    SELECT id INTO v_supplier_product_id 
    FROM public.supplier_products 
    WHERE supplier_id = p_supplier_id AND product_id = p_product_id AND available = true;
    
    IF v_supplier_product_id IS NULL THEN RAISE EXCEPTION 'Product not available from this supplier'; END IF;

    -- Check Capacity
    SELECT (max_capacity - reserved_quantity - fulfilled_quantity) INTO v_available_capacity 
    FROM public.supplier_capacity 
    WHERE supplier_id = p_supplier_id AND date = timezone('Asia/Kolkata', now())::date
    FOR UPDATE;

    IF COALESCE(v_available_capacity, 0) < p_quantity THEN 
        RAISE EXCEPTION 'Insufficient supplier capacity for this order'; 
    END IF;

    -- Resolve secure price
    v_unit_price := public.get_effective_customer_price(v_supplier_customer_id, v_supplier_product_id);
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Could not resolve pricing'; END IF;

    v_subtotal := v_unit_price * p_quantity;

    -- AUTOMATIC BULK DISCOUNT: 10% off for quantities >= 100
    IF p_quantity >= 100 THEN
        v_subtotal := v_subtotal * 0.9;
    END IF;

    -- Insert Order
    INSERT INTO public.orders (customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status)
    VALUES (v_user_id, p_supplier_id, p_address_id, 'placed', v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee, p_payment_method, 'pending')
    RETURNING id INTO v_order_id;

    -- Insert Order Items
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, p_product_id, p_quantity, v_unit_price, v_subtotal);

    -- Track history
    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'placed', v_user_id);

    -- Idempotency save
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.api_idempotency (idempotency_key, user_id, api_route, response_payload)
        VALUES (p_idempotency_key, v_user_id, 'place_order', jsonb_build_object('order_id', v_order_id));
    END IF;

    RETURN v_order_id;
END;
$$;


ALTER FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_vehicle_location"("p_run_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_speed" double precision, "p_accuracy_m" double precision, "p_heading" double precision, "p_altitude" double precision, "p_captured_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_vehicle_id UUID;
    v_run_status delivery_run_status;
    v_current_stop RECORD;
    v_customer_lat FLOAT;
    v_customer_lng FLOAT;
    v_distance_km FLOAT;
    v_assumed_speed_kmh FLOAT := 15.0; -- Default urban speed in km/h if vehicle is stopped or speed is erratic
    v_eta_hours FLOAT;
    v_eta_minutes INTEGER;
    v_alert_threshold_minutes INTEGER := 10;
BEGIN
    -- 1. Validate run and get vehicle
    SELECT vehicle_id, status INTO v_vehicle_id, v_run_status
    FROM public.delivery_runs
    WHERE id = p_run_id;

    IF v_run_status != 'in_progress' THEN
        RAISE EXCEPTION 'Run is not in progress';
    END IF;

    -- 2. Insert Location Telemetry
    INSERT INTO public.vehicle_locations (
        run_id, vehicle_id, latitude, longitude, speed, accuracy_m, heading, altitude, captured_at
    ) VALUES (
        p_run_id, v_vehicle_id, p_lat, p_lng, p_speed, p_accuracy_m, p_heading, p_altitude, p_captured_at
    );

    -- If accuracy is terrible (> 100m), don't trigger alerts based on this point
    IF p_accuracy_m > 100 THEN
        RETURN;
    END IF;

    -- 3. Determine Current Stop (First stop that is planned or en_route)
    SELECT drs.* INTO v_current_stop
    FROM public.delivery_run_stops drs
    WHERE drs.run_id = p_run_id
      AND drs.status IN ('planned', 'en_route')
    ORDER BY drs.sequence_number ASC
    LIMIT 1;

    -- If no stops remaining, do nothing
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 4. Get Customer Location
    SELECT latitude, longitude INTO v_customer_lat, v_customer_lng
    FROM public.addresses
    WHERE id = v_current_stop.address_id;

    -- If customer has no lat/lng, we can't calculate ETA
    IF v_customer_lat IS NULL OR v_customer_lng IS NULL THEN
        RETURN;
    END IF;

    -- 5. Calculate Approximate ETA
    v_distance_km := calculate_distance_km(p_lat, p_lng, v_customer_lat, v_customer_lng);
    
    -- Use current speed if reasonable (e.g. between 5 and 80 km/h), else use default
    -- (Assuming p_speed is in m/s, convert to km/h: speed * 3.6)
    IF p_speed IS NOT NULL AND (p_speed * 3.6) > 5 AND (p_speed * 3.6) < 80 THEN
        v_assumed_speed_kmh := p_speed * 3.6;
    END IF;

    v_eta_hours := v_distance_km / v_assumed_speed_kmh;
    v_eta_minutes := round(v_eta_hours * 60);

    -- Update ETA on the stop
    UPDATE public.delivery_run_stops
    SET eta_minutes = v_eta_minutes,
        eta_calculated_at = now()
    WHERE id = v_current_stop.id;

    -- 6. Trigger Notification if threshold crossed
    IF v_eta_minutes <= v_alert_threshold_minutes AND v_current_stop.arrival_alert_sent_at IS NULL THEN
        
        -- Mark stop to prevent duplicate alerts
        UPDATE public.delivery_run_stops
        SET arrival_alert_sent_at = now(),
            status = 'en_route' -- automatically transition to en_route
        WHERE id = v_current_stop.id;

        -- Atomically create notification event
        INSERT INTO public.delivery_notifications (
            user_id, stop_id, notification_type, title, body, payload
        )
        SELECT
            p.id, -- auth user id corresponding to the profile
            v_current_stop.id,
            'arrival_alert',
            'Water arriving soon',
            'Your 20L jar delivery is approximately ' || v_eta_minutes || ' minutes away.',
            jsonb_build_object(
                'eta_minutes', v_eta_minutes,
                'run_id', p_run_id,
                'stop_id', v_current_stop.id
            )
        FROM public.profiles p
        WHERE p.id = v_current_stop.customer_id;
        
    END IF;

END;
$$;


ALTER FUNCTION "public"."process_vehicle_location"("p_run_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_speed" double precision, "p_accuracy_m" double precision, "p_heading" double precision, "p_altitude" double precision, "p_captured_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_inventory_purchase"("p_quantity" integer, "p_unit_price" numeric DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    INSERT INTO public.supplier_inventory (supplier_id, owned, available)
    VALUES (v_supplier_id, p_quantity, p_quantity)
    ON CONFLICT (supplier_id) 
    DO UPDATE SET 
        owned = public.supplier_inventory.owned + p_quantity,
        available = public.supplier_inventory.available + p_quantity,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."record_inventory_purchase"("p_quantity" integer, "p_unit_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_ledger_payment"("p_customer_id" "uuid", "p_amount" numeric, "p_payment_method" "text" DEFAULT 'cash'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    INSERT INTO public.payments (
        supplier_customer_id, amount, payment_method, status
    ) VALUES (
        p_customer_id, p_amount, p_payment_method::public.payment_method_enum, 'completed'
    );
END;
$$;


ALTER FUNCTION "public"."record_ledger_payment"("p_customer_id" "uuid", "p_amount" numeric, "p_payment_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_manual_jar_adjustment"("p_customer_id" "uuid", "p_jars_returned" integer, "p_jars_delivered" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_current_jar_balance INTEGER;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Verify customer ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Lock the customer jar balance row
    SELECT jars_with_customer INTO v_current_jar_balance 
    FROM public.customer_jar_balances 
    WHERE supplier_customer_id = p_customer_id 
    FOR UPDATE;

    IF (v_current_jar_balance + p_jars_delivered - p_jars_returned) < 0 THEN
        RAISE EXCEPTION 'Negative jar balance constraint violation';
    END IF;

    IF p_jars_delivered > 0 THEN
        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, transaction_type, quantity, jars_delivered, jars_returned)
        VALUES (p_customer_id, NULL, 'delivered_to_customer', p_jars_delivered, p_jars_delivered, 0);
    END IF;

    IF p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, transaction_type, quantity, jars_delivered, jars_returned)
        VALUES (p_customer_id, NULL, 'returned_by_customer', p_jars_returned, 0, p_jars_returned);
    END IF;
    
    -- Update customer balance
    UPDATE public.customer_jar_balances
    SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
    WHERE supplier_customer_id = p_customer_id;

    -- Update Supplier Inventory logic
    UPDATE public.supplier_inventory
    SET available = available - p_jars_delivered + p_jars_returned,
        with_customers = with_customers + p_jars_delivered - p_jars_returned
    WHERE supplier_id = v_supplier_id;
    
    -- Supplier Audit Trail
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
        VALUES (v_supplier_id, 'adjustment', NULL, -p_jars_delivered);
    END IF;
    
    IF p_jars_returned > 0 THEN
        INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
        VALUES (v_supplier_id, 'adjustment', NULL, p_jars_returned);
    END IF;
END;
$$;


ALTER FUNCTION "public"."record_manual_jar_adjustment"("p_customer_id" "uuid", "p_jars_returned" integer, "p_jars_delivered" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_order"("p_order_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order RECORD;
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    
    v_supplier_id := public.get_supplier_id();

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_supplier_id IS NULL OR v_order.supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Order is not assigned to you'; END IF;
    IF v_order.status != 'placed' THEN RAISE EXCEPTION 'Order must be in placed status to reject'; END IF;

    UPDATE public.orders SET status = 'rejected', rejection_reason = p_reason WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes) VALUES (p_order_id, 'rejected', auth.uid(), p_reason);
END;
$$;


ALTER FUNCTION "public"."reject_order"("p_order_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_price" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Deactivate old prices for this product
    UPDATE public.customer_product_prices 
    SET effective_until = NOW(), updated_at = NOW()
    WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id AND (effective_until IS NULL OR effective_until > NOW());

    -- Insert new active price
    INSERT INTO public.customer_product_prices (
        supplier_customer_id, supplier_product_id, price, effective_from
    ) VALUES (
        p_customer_id, p_supplier_product_id, p_price, NOW()
    );
END;
$$;


ALTER FUNCTION "public"."set_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_delivery_schedule_status"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_is_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    UPDATE public.customer_delivery_schedules 
    SET is_active = p_is_active, updated_at = NOW()
    WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id;
END;
$$;


ALTER FUNCTION "public"."set_delivery_schedule_status"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_supplier_capacity"("p_date" "date", "p_max_capacity" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    v_supplier_id := public.get_supplier_id();

    IF p_max_capacity < (SELECT COALESCE(reserved_quantity + fulfilled_quantity, 0) FROM public.supplier_capacity WHERE supplier_id = v_supplier_id AND date = p_date) THEN
        RAISE EXCEPTION 'Max capacity cannot be less than already committed capacity';
    END IF;

    INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity)
    VALUES (v_supplier_id, p_date, p_max_capacity)
    ON CONFLICT (supplier_id, date) DO UPDATE SET max_capacity = EXCLUDED.max_capacity;
END;
$$;


ALTER FUNCTION "public"."set_supplier_capacity"("p_date" "date", "p_max_capacity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_supplier_product"("p_product_id" "uuid", "p_price" numeric, "p_available" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Supplier record not found for user'; END IF;

    IF p_price <= 0 THEN RAISE EXCEPTION 'Price must be greater than zero'; END IF;

    INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
    VALUES (v_supplier_id, p_product_id, p_price, p_available)
    ON CONFLICT (supplier_id, product_id) 
    DO UPDATE SET 
        price = EXCLUDED.price,
        available = EXCLUDED.available,
        updated_at = now();
END;
$$;


ALTER FUNCTION "public"."set_supplier_product"("p_product_id" "uuid", "p_price" numeric, "p_available" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_push_notification_edge_function"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_edge_function_url TEXT;
BEGIN
  -- We assume the edge function is served locally during dev or at a known URL in prod.
  -- In a real setup, you'd use a secret or env var, but for this migration we'll use a placeholder
  -- or rely on the Supabase UI to set the exact URL. 
  
  -- The payload sent to the Edge Function will be the newly inserted notification row
  PERFORM net.http_post(
    url := coalesce(current_setting('app.settings.edge_function_url', true), 'http://kong:8000/functions/v1/push-notifications'),
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'delivery_notifications',
      'schema', 'public',
      'record', row_to_json(NEW)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't let webhook failure crash the transaction
  RAISE WARNING 'Failed to trigger edge function: %', SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_push_notification_edge_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
    v_supplier_customer_id UUID;
    v_supplier_product_id UUID;
    v_unit_price NUMERIC(10,2);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_new_status = 'accepted' THEN
        PERFORM public.accept_order(p_order_id);
        RETURN;
    ELSIF p_new_status = 'rejected' THEN
        PERFORM public.reject_order(p_order_id, 'Rejected by supplier');
        RETURN;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    SELECT SUM(quantity), MAX(unit_price), MAX(product_id) INTO v_total_quantity, v_unit_price, v_supplier_product_id 
    FROM public.order_items WHERE order_id = p_order_id;
    
    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    IF p_new_status = 'cancelled' AND v_order.status IN ('accepted', 'preparing', 'out_for_delivery') THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity 
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
        
    ELSIF p_new_status = 'delivered' AND v_order.status = 'out_for_delivery' THEN
        -- Standard order capacity logic
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity, fulfilled_quantity = fulfilled_quantity + v_total_quantity 
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
        
        -- Get the CRM mapping
        SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
        WHERE user_id = v_order.customer_id AND supplier_id = v_order.supplier_id;
        
        -- Get the exact supplier product
        SELECT id INTO v_supplier_product_id FROM public.supplier_products 
        WHERE supplier_id = v_order.supplier_id AND product_id = (SELECT product_id FROM public.order_items WHERE order_id = p_order_id LIMIT 1);

        -- Record the transaction into the Supplier CRM (creates delivery, adjusts jars, ledger)
        IF v_supplier_customer_id IS NOT NULL AND v_supplier_product_id IS NOT NULL THEN
            PERFORM public.complete_delivery(
                v_supplier_customer_id,
                v_supplier_product_id,
                v_total_quantity,
                v_unit_price,
                v_total_quantity, -- Assumes jars delivered = quantity
                0, -- No returned jars tracked directly in marketplace yet
                (CASE WHEN v_order.payment_status = 'paid' THEN v_order.total ELSE 0 END), -- Amount collected
                v_order.payment_method
            );
        END IF;
    END IF;

    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, p_new_status, auth.uid());
END;
$$;


ALTER FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stop_status"("p_stop_id" "uuid", "p_status" "public"."delivery_stop_status", "p_skip_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."update_stop_status"("p_stop_id" "uuid", "p_status" "public"."delivery_stop_status", "p_skip_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_supplier_location"("p_supplier_id" "uuid", "p_lng" double precision, "p_lat" double precision) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.suppliers
    SET location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
    WHERE id = p_supplier_id;
END;
$$;


ALTER FUNCTION "public"."update_supplier_location"("p_supplier_id" "uuid", "p_lng" double precision, "p_lat" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_supplier_profile"("p_business_name" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_address" "text" DEFAULT NULL::"text", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_is_accepting_orders" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    UPDATE public.suppliers
    SET
        business_name = COALESCE(p_business_name, business_name),
        description = COALESCE(p_description, description),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        lat = COALESCE(p_lat, lat),
        lng = COALESCE(p_lng, lng),
        is_accepting_orders = COALESCE(p_is_accepting_orders, is_accepting_orders)
    WHERE profile_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."update_supplier_profile"("p_business_name" "text", "p_description" "text", "p_phone" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision, "p_is_accepting_orders" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = timezone('Asia/Kolkata', now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text",
    "address" "text" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    CONSTRAINT "addresses_label_check" CHECK (("label" = ANY (ARRAY['Home'::"text", 'Office'::"text", 'Other'::"text"])))
);


ALTER TABLE "public"."addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_idempotency" (
    "idempotency_key" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "api_route" "text" NOT NULL,
    "response_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_idempotency" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_delivery_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_customer_id" "uuid" NOT NULL,
    "supplier_product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "interval_days" integer NOT NULL,
    "next_delivery_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_address" "text",
    CONSTRAINT "customer_delivery_schedules_interval_days_check" CHECK (("interval_days" > 0)),
    CONSTRAINT "customer_delivery_schedules_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."customer_delivery_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_jar_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_customer_id" "uuid" NOT NULL,
    "jars_with_customer" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_jar_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_ledger_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "supplier_customer_id" "uuid" NOT NULL,
    "reference_type" "text" NOT NULL,
    "reference_id" "uuid",
    "entry_type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "customer_ledger_entries_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "customer_ledger_entries_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['debit'::"text", 'credit'::"text"]))),
    CONSTRAINT "customer_ledger_entries_reference_type_check" CHECK (("reference_type" = ANY (ARRAY['delivery'::"text", 'payment'::"text", 'adjustment'::"text", 'reversal'::"text"])))
);


ALTER TABLE "public"."customer_ledger_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_product_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_customer_id" "uuid" NOT NULL,
    "supplier_product_id" "uuid" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_product_prices_price_check" CHECK (("price" > (0)::numeric))
);


ALTER TABLE "public"."customer_product_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "supplier_customer_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "delivery_date" "date" NOT NULL,
    "total_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "uuid",
    CONSTRAINT "deliveries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'delivered'::"text", 'skipped'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "supplier_product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "total_price" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "delivery_items_total_price_check" CHECK (("total_price" >= (0)::numeric)),
    CONSTRAINT "delivery_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."delivery_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stop_id" "uuid",
    "notification_type" "text" NOT NULL,
    "title" "text",
    "body" "text",
    "payload" "jsonb",
    "status" "public"."notification_status" DEFAULT 'pending'::"public"."notification_status",
    "error_message" "text",
    "attempt_count" integer DEFAULT 0,
    "sent_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "order_id" "uuid"
);


ALTER TABLE "public"."delivery_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_run_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "schedule_id" "uuid",
    "sequence_number" integer NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "address_id" "uuid",
    "product_id" "uuid",
    "quantity" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "total_amount" numeric(10,2) NOT NULL,
    "status" "public"."delivery_stop_status" DEFAULT 'planned'::"public"."delivery_stop_status",
    "skip_reason" "text",
    "planned_arrival_window_start" timestamp with time zone,
    "planned_arrival_window_end" timestamp with time zone,
    "eta_minutes" integer,
    "eta_calculated_at" timestamp with time zone,
    "arrival_alert_sent_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "arrived_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "skipped_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."delivery_run_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "driver_id" "uuid",
    "run_date" "date" NOT NULL,
    "status" "public"."delivery_run_status" DEFAULT 'planned'::"public"."delivery_run_status",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."delivery_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jar_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_customer_id" "uuid" NOT NULL,
    "delivery_id" "uuid",
    "jars_delivered" integer DEFAULT 0 NOT NULL,
    "jars_returned" integer DEFAULT 0 NOT NULL,
    "transaction_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transaction_type" "public"."jar_transaction_type" DEFAULT 'legacy'::"public"."jar_transaction_type" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."jar_transactions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."order_display_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."order_display_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_total_check" CHECK (("total" > (0)::numeric)),
    CONSTRAINT "order_items_unit_price_check" CHECK (("unit_price" > (0)::numeric))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "changed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_id" "text" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "address_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "rejection_reason" "text",
    "subtotal" numeric(10,2) NOT NULL,
    "delivery_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "capacity_date" "date",
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'upi'::"text"]))),
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['placed'::"text", 'accepted'::"text", 'rejected'::"text", 'preparing'::"text", 'out_for_delivery'::"text", 'delivered'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "supplier_customer_id" "uuid" NOT NULL,
    "delivery_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "payment_method" "text" DEFAULT 'cash'::"text" NOT NULL,
    "payment_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."payment_status_enum" DEFAULT 'completed'::"public"."payment_status_enum" NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "unit" "text" DEFAULT 'jar'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "image_url" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "avatar_url" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['customer'::"text", 'supplier'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_capacity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "max_capacity" integer NOT NULL,
    "reserved_quantity" integer DEFAULT 0 NOT NULL,
    "fulfilled_quantity" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    CONSTRAINT "capacity_not_exceeded" CHECK ((("reserved_quantity" + "fulfilled_quantity") <= "max_capacity")),
    CONSTRAINT "supplier_capacity_fulfilled_quantity_check" CHECK (("fulfilled_quantity" >= 0)),
    CONSTRAINT "supplier_capacity_max_capacity_check" CHECK (("max_capacity" >= 0)),
    CONSTRAINT "supplier_capacity_reserved_quantity_check" CHECK (("reserved_quantity" >= 0))
);


ALTER TABLE "public"."supplier_capacity" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."supplier_capacity_view" AS
 SELECT "id",
    "supplier_id",
    "date",
    "max_capacity",
    "reserved_quantity",
    "fulfilled_quantity",
    (("max_capacity" - "reserved_quantity") - "fulfilled_quantity") AS "available_quantity",
    "created_at",
    "updated_at"
   FROM "public"."supplier_capacity";


ALTER VIEW "public"."supplier_capacity_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "normalized_phone" "text" NOT NULL,
    "customer_type" "public"."customer_type_enum" DEFAULT 'household'::"public"."customer_type_enum" NOT NULL,
    "address" "text",
    "sector" "text",
    "landmark" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "business_name" "text" NOT NULL,
    "description" "text",
    "phone" "text",
    "address" "text",
    "lat" double precision,
    "lng" double precision,
    "is_active" boolean DEFAULT false NOT NULL,
    "is_accepting_orders" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "is_verified" boolean DEFAULT true
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."supplier_financial_reconciliation" AS
 SELECT "id" AS "supplier_id",
    COALESCE(( SELECT "sum"("d"."total_amount") AS "sum"
           FROM "public"."deliveries" "d"
          WHERE ("d"."supplier_id" = "s"."id")), (0)::numeric) AS "total_billed",
    COALESCE(( SELECT "sum"("p"."amount") AS "sum"
           FROM "public"."payments" "p"
          WHERE ("p"."supplier_id" = "s"."id")), (0)::numeric) AS "total_collected",
    COALESCE(( SELECT "sum"("customer_ledger_entries"."amount") AS "sum"
           FROM "public"."customer_ledger_entries"
          WHERE (("customer_ledger_entries"."supplier_id" = "s"."id") AND ("customer_ledger_entries"."entry_type" = 'debit'::"text"))), (0)::numeric) AS "ledger_debits",
    COALESCE(( SELECT "sum"("customer_ledger_entries"."amount") AS "sum"
           FROM "public"."customer_ledger_entries"
          WHERE (("customer_ledger_entries"."supplier_id" = "s"."id") AND ("customer_ledger_entries"."entry_type" = 'credit'::"text"))), (0)::numeric) AS "ledger_credits",
    (COALESCE(( SELECT "sum"("d"."total_amount") AS "sum"
           FROM "public"."deliveries" "d"
          WHERE ("d"."supplier_id" = "s"."id")), (0)::numeric) = COALESCE(( SELECT "sum"("customer_ledger_entries"."amount") AS "sum"
           FROM "public"."customer_ledger_entries"
          WHERE (("customer_ledger_entries"."supplier_id" = "s"."id") AND ("customer_ledger_entries"."entry_type" = 'debit'::"text") AND ("customer_ledger_entries"."reference_type" = 'delivery'::"text"))), (0)::numeric)) AS "is_billing_synced",
    (COALESCE(( SELECT "sum"("p"."amount") AS "sum"
           FROM "public"."payments" "p"
          WHERE ("p"."supplier_id" = "s"."id")), (0)::numeric) = COALESCE(( SELECT "sum"("customer_ledger_entries"."amount") AS "sum"
           FROM "public"."customer_ledger_entries"
          WHERE (("customer_ledger_entries"."supplier_id" = "s"."id") AND ("customer_ledger_entries"."entry_type" = 'credit'::"text") AND ("customer_ledger_entries"."reference_type" = 'payment'::"text"))), (0)::numeric)) AS "is_collection_synced"
   FROM "public"."suppliers" "s";


ALTER VIEW "public"."supplier_financial_reconciliation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_inventory" (
    "supplier_id" "uuid" NOT NULL,
    "owned" integer DEFAULT 0 NOT NULL,
    "available" integer DEFAULT 0 NOT NULL,
    "with_customers" integer DEFAULT 0 NOT NULL,
    "damaged" integer DEFAULT 0 NOT NULL,
    "missing" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "reference_type" "text" NOT NULL,
    "reference_id" "uuid",
    "quantity_change" integer NOT NULL,
    "transaction_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supplier_inventory_transactions_reference_type_check" CHECK (("reference_type" = ANY (ARRAY['delivery'::"text", 'return'::"text", 'damage'::"text", 'loss'::"text", 'adjustment'::"text", 'purchase'::"text"])))
);


ALTER TABLE "public"."supplier_inventory_transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."supplier_jar_reconciliation" AS
 SELECT "supplier_id",
    "owned" AS "owned_jars",
    "available" AS "available_jars",
    "with_customers" AS "customer_jars",
    "damaged" AS "damaged_jars",
    "missing" AS "missing_jars",
    ("owned" = ((("available" + "with_customers") + "damaged") + "missing")) AS "is_equation_valid",
    ("with_customers" = COALESCE(( SELECT "sum"("cjb"."jars_with_customer") AS "sum"
           FROM ("public"."customer_jar_balances" "cjb"
             JOIN "public"."supplier_customers" "sc" ON (("cjb"."supplier_customer_id" = "sc"."id")))
          WHERE ("sc"."supplier_id" = "si"."supplier_id")), (0)::bigint)) AS "is_customer_sum_valid"
   FROM "public"."supplier_inventory" "si";


ALTER VIEW "public"."supplier_jar_reconciliation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('Asia/Kolkata'::"text", "now"()) NOT NULL,
    CONSTRAINT "supplier_products_price_check" CHECK (("price" > (0)::numeric))
);


ALTER TABLE "public"."supplier_products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."supplier_schedule_integrity" AS
 SELECT "id" AS "supplier_id",
    ( SELECT "count"(*) AS "count"
           FROM ( SELECT "customer_delivery_schedules"."supplier_customer_id",
                    "customer_delivery_schedules"."supplier_product_id"
                   FROM "public"."customer_delivery_schedules"
                  WHERE ("customer_delivery_schedules"."is_active" = true)
                  GROUP BY "customer_delivery_schedules"."supplier_customer_id", "customer_delivery_schedules"."supplier_product_id"
                 HAVING ("count"(*) > 1)) "duplicates") AS "duplicate_schedules_count",
    ( SELECT "count"(*) AS "count"
           FROM ( SELECT "d"."supplier_customer_id",
                    "di"."supplier_product_id",
                    "d"."delivery_date"
                   FROM ("public"."deliveries" "d"
                     JOIN "public"."delivery_items" "di" ON (("d"."id" = "di"."delivery_id")))
                  WHERE ("d"."supplier_id" = "s"."id")
                  GROUP BY "d"."supplier_customer_id", "di"."supplier_product_id", "d"."delivery_date"
                 HAVING ("count"(*) > 1)) "duplicates") AS "duplicate_deliveries_count",
    ( SELECT "count"(*) AS "count"
           FROM ("public"."deliveries" "d"
             JOIN "public"."delivery_items" "di" ON (("d"."id" = "di"."delivery_id")))
          WHERE (("d"."supplier_id" = "s"."id") AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."customer_delivery_schedules" "cds"
                  WHERE (("cds"."supplier_customer_id" = "d"."supplier_customer_id") AND ("cds"."supplier_product_id" = "di"."supplier_product_id"))))))) AS "orphan_deliveries_count"
   FROM "public"."suppliers" "s";


ALTER VIEW "public"."supplier_schedule_integrity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text",
    "is_active" boolean DEFAULT true,
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "assignment_date" "date" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "altitude" double precision,
    "heading" double precision,
    "speed" double precision,
    "accuracy_m" double precision,
    "captured_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "vehicle_number" "text" NOT NULL,
    "vehicle_type" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_idempotency"
    ADD CONSTRAINT "api_idempotency_pkey" PRIMARY KEY ("idempotency_key");



ALTER TABLE ONLY "public"."customer_delivery_schedules"
    ADD CONSTRAINT "customer_delivery_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_jar_balances"
    ADD CONSTRAINT "customer_jar_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_jar_balances"
    ADD CONSTRAINT "customer_jar_balances_supplier_customer_id_key" UNIQUE ("supplier_customer_id");



ALTER TABLE ONLY "public"."customer_ledger_entries"
    ADD CONSTRAINT "customer_ledger_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_notifications"
    ADD CONSTRAINT "delivery_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_run_stops"
    ADD CONSTRAINT "delivery_run_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_runs"
    ADD CONSTRAINT "delivery_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_supplier_id_profile_id_key" UNIQUE ("supplier_id", "profile_id");



ALTER TABLE ONLY "public"."jar_transactions"
    ADD CONSTRAINT "jar_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_display_id_key" UNIQUE ("display_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_capacity"
    ADD CONSTRAINT "supplier_capacity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_capacity"
    ADD CONSTRAINT "supplier_capacity_supplier_id_date_key" UNIQUE ("supplier_id", "date");



ALTER TABLE ONLY "public"."supplier_customers"
    ADD CONSTRAINT "supplier_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_customers"
    ADD CONSTRAINT "supplier_customers_supplier_id_normalized_phone_key" UNIQUE ("supplier_id", "normalized_phone");



ALTER TABLE ONLY "public"."supplier_inventory"
    ADD CONSTRAINT "supplier_inventory_pkey" PRIMARY KEY ("supplier_id");



ALTER TABLE ONLY "public"."supplier_inventory_transactions"
    ADD CONSTRAINT "supplier_inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_supplier_id_product_id_key" UNIQUE ("supplier_id", "product_id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_expo_push_token_key" UNIQUE ("user_id", "expo_push_token");



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_driver_id_assignment_date_key" UNIQUE ("driver_id", "assignment_date");



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_vehicle_id_assignment_date_key" UNIQUE ("vehicle_id", "assignment_date");



ALTER TABLE ONLY "public"."vehicle_locations"
    ADD CONSTRAINT "vehicle_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "idx_active_customer_price" ON "public"."customer_product_prices" USING "btree" ("supplier_customer_id", "supplier_product_id") WHERE ("effective_until" IS NULL);



CREATE INDEX "idx_addresses_user_id" ON "public"."addresses" USING "btree" ("user_id");



CREATE INDEX "idx_customer_delivery_schedules_customer_id" ON "public"."customer_delivery_schedules" USING "btree" ("supplier_customer_id");



CREATE INDEX "idx_customer_product_prices_customer_id" ON "public"."customer_product_prices" USING "btree" ("supplier_customer_id");



CREATE INDEX "idx_deliveries_supplier_id_date" ON "public"."deliveries" USING "btree" ("supplier_id", "delivery_date");



CREATE INDEX "idx_delivery_notifications_status" ON "public"."delivery_notifications" USING "btree" ("status");



CREATE INDEX "idx_delivery_notifications_stop_id" ON "public"."delivery_notifications" USING "btree" ("stop_id");



CREATE INDEX "idx_delivery_run_stops_run_id" ON "public"."delivery_run_stops" USING "btree" ("run_id");



CREATE INDEX "idx_delivery_run_stops_schedule_id" ON "public"."delivery_run_stops" USING "btree" ("schedule_id");



CREATE INDEX "idx_delivery_runs_driver_date" ON "public"."delivery_runs" USING "btree" ("driver_id", "run_date");



CREATE INDEX "idx_delivery_runs_supplier_date" ON "public"."delivery_runs" USING "btree" ("supplier_id", "run_date");



CREATE INDEX "idx_drivers_profile_id" ON "public"."drivers" USING "btree" ("profile_id");



CREATE INDEX "idx_drivers_supplier_id" ON "public"."drivers" USING "btree" ("supplier_id");



CREATE INDEX "idx_jar_transactions_customer_id" ON "public"."jar_transactions" USING "btree" ("supplier_customer_id");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_status_history_order_id" ON "public"."order_status_history" USING "btree" ("order_id");



CREATE INDEX "idx_orders_customer_id" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_supplier_id" ON "public"."orders" USING "btree" ("supplier_id");



CREATE INDEX "idx_payments_customer_id" ON "public"."payments" USING "btree" ("supplier_customer_id");



CREATE INDEX "idx_payments_supplier_id" ON "public"."payments" USING "btree" ("supplier_id");



CREATE INDEX "idx_supplier_capacity_supplier_date" ON "public"."supplier_capacity" USING "btree" ("supplier_id", "date");



CREATE INDEX "idx_supplier_customers_supplier_id" ON "public"."supplier_customers" USING "btree" ("supplier_id");



CREATE INDEX "idx_supplier_products_product_id" ON "public"."supplier_products" USING "btree" ("product_id");



CREATE INDEX "idx_supplier_products_supplier_id" ON "public"."supplier_products" USING "btree" ("supplier_id");



CREATE INDEX "idx_suppliers_active_accepting" ON "public"."suppliers" USING "btree" ("is_active", "is_accepting_orders");



CREATE INDEX "idx_suppliers_profile_id" ON "public"."suppliers" USING "btree" ("profile_id");



CREATE INDEX "idx_user_devices_user_id" ON "public"."user_devices" USING "btree" ("user_id");



CREATE INDEX "idx_vehicle_assignments_supplier_date" ON "public"."vehicle_assignments" USING "btree" ("supplier_id", "assignment_date");



CREATE INDEX "idx_vehicle_locations_run_id" ON "public"."vehicle_locations" USING "btree" ("run_id");



CREATE INDEX "idx_vehicles_supplier_id" ON "public"."vehicles" USING "btree" ("supplier_id");



CREATE OR REPLACE TRIGGER "addresses_updated_at" BEFORE UPDATE ON "public"."addresses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "delivery_notifications_webhook" AFTER INSERT ON "public"."delivery_notifications" FOR EACH ROW WHEN (("new"."status" = 'pending'::"public"."notification_status")) EXECUTE FUNCTION "public"."trigger_push_notification_edge_function"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."customer_delivery_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."customer_jar_balances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."customer_product_prices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."supplier_customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "orders_generate_display_id" BEFORE INSERT ON "public"."orders" FOR EACH ROW WHEN (("new"."display_id" IS NULL)) EXECUTE FUNCTION "public"."generate_order_display_id"();



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_delivery_notifications" BEFORE UPDATE ON "public"."delivery_notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_delivery_run_stops" BEFORE UPDATE ON "public"."delivery_run_stops" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_delivery_runs" BEFORE UPDATE ON "public"."delivery_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_drivers" BEFORE UPDATE ON "public"."drivers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_vehicle_assignments" BEFORE UPDATE ON "public"."vehicle_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_vehicles" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "supplier_capacity_updated_at" BEFORE UPDATE ON "public"."supplier_capacity" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "supplier_products_updated_at" BEFORE UPDATE ON "public"."supplier_products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_idempotency"
    ADD CONSTRAINT "api_idempotency_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customer_delivery_schedules"
    ADD CONSTRAINT "customer_delivery_schedules_supplier_customer_id_fkey" FOREIGN KEY ("supplier_customer_id") REFERENCES "public"."supplier_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_delivery_schedules"
    ADD CONSTRAINT "customer_delivery_schedules_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_jar_balances"
    ADD CONSTRAINT "customer_jar_balances_supplier_customer_id_fkey" FOREIGN KEY ("supplier_customer_id") REFERENCES "public"."supplier_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_ledger_entries"
    ADD CONSTRAINT "customer_ledger_entries_supplier_customer_id_fkey" FOREIGN KEY ("supplier_customer_id") REFERENCES "public"."supplier_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_ledger_entries"
    ADD CONSTRAINT "customer_ledger_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_supplier_customer_id_fkey" FOREIGN KEY ("supplier_customer_id") REFERENCES "public"."supplier_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_product_prices"
    ADD CONSTRAINT "customer_product_prices_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_supplier_customer_id_fkey" FOREIGN KEY ("supplier_customer_id") REFERENCES "public"."supplier_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_notifications"
    ADD CONSTRAINT "delivery_notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_notifications"
    ADD CONSTRAINT "delivery_notifications_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "public"."delivery_run_stops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_notifications"
    ADD CONSTRAINT "delivery_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_run_stops"
    ADD CONSTRAINT "delivery_run_stops_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id");



ALTER TABLE ONLY "public"."delivery_run_stops"
    ADD CONSTRAINT "delivery_run_stops_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."delivery_run_stops"
    ADD CONSTRAINT "delivery_run_stops_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."delivery_run_stops"
    ADD CONSTRAINT "delivery_run_stops_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."delivery_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_run_stops"
    ADD CONSTRAINT "delivery_run_stops_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."customer_delivery_schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_runs"
    ADD CONSTRAINT "delivery_runs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_runs"
    ADD CONSTRAINT "delivery_runs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_runs"
    ADD CONSTRAINT "delivery_runs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jar_transactions"
    ADD CONSTRAINT "jar_transactions_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jar_transactions"
    ADD CONSTRAINT "jar_transactions_supplier_customer_id_fkey" FOREIGN KEY ("supplier_customer_id") REFERENCES "public"."supplier_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_supplier_customer_id_fkey" FOREIGN KEY ("supplier_customer_id") REFERENCES "public"."supplier_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_capacity"
    ADD CONSTRAINT "supplier_capacity_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_customers"
    ADD CONSTRAINT "supplier_customers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_customers"
    ADD CONSTRAINT "supplier_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_inventory"
    ADD CONSTRAINT "supplier_inventory_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_inventory_transactions"
    ADD CONSTRAINT "supplier_inventory_transactions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_locations"
    ADD CONSTRAINT "vehicle_locations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."delivery_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_locations"
    ADD CONSTRAINT "vehicle_locations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



CREATE POLICY "Admins have full access to customer_delivery_schedules" ON "public"."customer_delivery_schedules" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to customer_jar_balances" ON "public"."customer_jar_balances" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to customer_product_prices" ON "public"."customer_product_prices" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to deliveries" ON "public"."deliveries" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to delivery_items" ON "public"."delivery_items" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to jar_transactions" ON "public"."jar_transactions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to payments" ON "public"."payments" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to supplier_customers" ON "public"."supplier_customers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Customers can insert their own schedules" ON "public"."customer_delivery_schedules" FOR INSERT TO "authenticated" WITH CHECK (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Customers can update their own schedules" ON "public"."customer_delivery_schedules" FOR UPDATE TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."user_id" = "auth"."uid"())))) WITH CHECK (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Customers can view their own schedules" ON "public"."customer_delivery_schedules" FOR SELECT TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Drivers can insert locations for their runs" ON "public"."vehicle_locations" FOR INSERT WITH CHECK (("run_id" IN ( SELECT "delivery_runs"."id"
   FROM "public"."delivery_runs"
  WHERE ("delivery_runs"."driver_id" IN ( SELECT "drivers"."id"
           FROM "public"."drivers"
          WHERE ("drivers"."profile_id" = "auth"."uid"()))))));



CREATE POLICY "Drivers can update their run stops" ON "public"."delivery_run_stops" FOR UPDATE USING (("run_id" IN ( SELECT "delivery_runs"."id"
   FROM "public"."delivery_runs"
  WHERE ("delivery_runs"."driver_id" IN ( SELECT "drivers"."id"
           FROM "public"."drivers"
          WHERE ("drivers"."profile_id" = "auth"."uid"()))))));



CREATE POLICY "Drivers can update their runs" ON "public"."delivery_runs" FOR UPDATE USING (("driver_id" IN ( SELECT "drivers"."id"
   FROM "public"."drivers"
  WHERE ("drivers"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Drivers can view their own record" ON "public"."drivers" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "Drivers can view their run stops" ON "public"."delivery_run_stops" FOR SELECT USING (("run_id" IN ( SELECT "delivery_runs"."id"
   FROM "public"."delivery_runs"
  WHERE ("delivery_runs"."driver_id" IN ( SELECT "drivers"."id"
           FROM "public"."drivers"
          WHERE ("drivers"."profile_id" = "auth"."uid"()))))));



CREATE POLICY "Drivers can view their runs" ON "public"."delivery_runs" FOR SELECT USING (("driver_id" IN ( SELECT "drivers"."id"
   FROM "public"."drivers"
  WHERE ("drivers"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Drivers can view their vehicle assignments" ON "public"."vehicle_assignments" FOR SELECT USING (("driver_id" IN ( SELECT "drivers"."id"
   FROM "public"."drivers"
  WHERE ("drivers"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Suppliers can manage their customer jar balances" ON "public"."customer_jar_balances" TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"())))) WITH CHECK (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can manage their customer prices" ON "public"."customer_product_prices" TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"())))) WITH CHECK (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can manage their customer schedules" ON "public"."customer_delivery_schedules" TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"())))) WITH CHECK (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can manage their deliveries" ON "public"."deliveries" TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"())) WITH CHECK (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Suppliers can manage their delivery items" ON "public"."delivery_items" TO "authenticated" USING (("delivery_id" IN ( SELECT "deliveries"."id"
   FROM "public"."deliveries"
  WHERE ("deliveries"."supplier_id" = "public"."get_supplier_id"())))) WITH CHECK (("delivery_id" IN ( SELECT "deliveries"."id"
   FROM "public"."deliveries"
  WHERE ("deliveries"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can manage their delivery run stops" ON "public"."delivery_run_stops" USING (("run_id" IN ( SELECT "delivery_runs"."id"
   FROM "public"."delivery_runs"
  WHERE ("delivery_runs"."supplier_id" IN ( SELECT "suppliers"."id"
           FROM "public"."suppliers"
          WHERE ("suppliers"."profile_id" = "auth"."uid"()))))));



CREATE POLICY "Suppliers can manage their delivery runs" ON "public"."delivery_runs" USING (("supplier_id" IN ( SELECT "suppliers"."id"
   FROM "public"."suppliers"
  WHERE ("suppliers"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Suppliers can manage their drivers" ON "public"."drivers" USING (("supplier_id" IN ( SELECT "suppliers"."id"
   FROM "public"."suppliers"
  WHERE ("suppliers"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Suppliers can manage their jar transactions" ON "public"."jar_transactions" TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"())))) WITH CHECK (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can manage their own customers" ON "public"."supplier_customers" TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"())) WITH CHECK (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Suppliers can manage their payments" ON "public"."payments" TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"())) WITH CHECK (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Suppliers can manage their vehicle assignments" ON "public"."vehicle_assignments" USING (("supplier_id" IN ( SELECT "suppliers"."id"
   FROM "public"."suppliers"
  WHERE ("suppliers"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Suppliers can manage their vehicles" ON "public"."vehicles" USING (("supplier_id" IN ( SELECT "suppliers"."id"
   FROM "public"."suppliers"
  WHERE ("suppliers"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Suppliers can view their customer jar balances" ON "public"."customer_jar_balances" FOR SELECT TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can view their customer prices" ON "public"."customer_product_prices" FOR SELECT TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can view their customer schedules" ON "public"."customer_delivery_schedules" FOR SELECT TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can view their deliveries" ON "public"."deliveries" FOR SELECT TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Suppliers can view their delivery items" ON "public"."delivery_items" FOR SELECT TO "authenticated" USING (("delivery_id" IN ( SELECT "deliveries"."id"
   FROM "public"."deliveries"
  WHERE ("deliveries"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can view their inventory" ON "public"."supplier_inventory" FOR SELECT TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Suppliers can view their jar transactions" ON "public"."jar_transactions" FOR SELECT TO "authenticated" USING (("supplier_customer_id" IN ( SELECT "supplier_customers"."id"
   FROM "public"."supplier_customers"
  WHERE ("supplier_customers"."supplier_id" = "public"."get_supplier_id"()))));



CREATE POLICY "Suppliers can view their ledger entries" ON "public"."customer_ledger_entries" FOR SELECT TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Suppliers can view their own customers" ON "public"."supplier_customers" FOR SELECT TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Suppliers can view their payments" ON "public"."payments" FOR SELECT TO "authenticated" USING (("supplier_id" = "public"."get_supplier_id"()));



CREATE POLICY "Users can insert their own idempotency keys" ON "public"."api_idempotency" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own devices" ON "public"."user_devices" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read their notifications" ON "public"."delivery_notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own idempotency keys" ON "public"."api_idempotency" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "addresses: DELETE own or admin" ON "public"."addresses" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "addresses: INSERT own or admin" ON "public"."addresses" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "addresses: SELECT own or admin" ON "public"."addresses" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "addresses: UPDATE own or admin" ON "public"."addresses" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."api_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_delivery_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_jar_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_ledger_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_product_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_run_stops" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jar_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items: SELECT via order relationship" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE ("orders"."id" = "order_items"."order_id"))));



ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_status_history: SELECT via order relationship" ON "public"."order_status_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE ("orders"."id" = "order_status_history"."order_id"))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders: SELECT only (customer own, supplier assigned, admin all" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("customer_id" = "auth"."uid"()) OR ("supplier_id" = "public"."get_supplier_id"()) OR "public"."is_admin"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products: DELETE admin" ON "public"."products" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "products: INSERT admin" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "products: SELECT authenticated only" ON "public"."products" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "products: UPDATE admin" ON "public"."products" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: SELECT own or admin" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "profiles: UPDATE own or admin" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK (((("id" = "auth"."uid"()) AND ("role" = ( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))) OR "public"."is_admin"()));



ALTER TABLE "public"."supplier_capacity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_capacity: DELETE admin" ON "public"."supplier_capacity" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "supplier_capacity: INSERT admin" ON "public"."supplier_capacity" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "supplier_capacity: SELECT authenticated" ON "public"."supplier_capacity" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "supplier_capacity: UPDATE admin" ON "public"."supplier_capacity" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."supplier_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_products: DELETE own or admin" ON "public"."supplier_products" FOR DELETE TO "authenticated" USING ((("supplier_id" = "public"."get_supplier_id"()) OR "public"."is_admin"()));



CREATE POLICY "supplier_products: INSERT own or admin" ON "public"."supplier_products" FOR INSERT TO "authenticated" WITH CHECK ((("supplier_id" = "public"."get_supplier_id"()) OR "public"."is_admin"()));



CREATE POLICY "supplier_products: SELECT authenticated" ON "public"."supplier_products" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "supplier_products: UPDATE own or admin" ON "public"."supplier_products" FOR UPDATE TO "authenticated" USING ((("supplier_id" = "public"."get_supplier_id"()) OR "public"."is_admin"()));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers: INSERT admin only" ON "public"."suppliers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "suppliers: SELECT authenticated (active or own or admin)" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR ("profile_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "suppliers: UPDATE own or admin" ON "public"."suppliers" FOR UPDATE USING ((("profile_id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK (("public"."is_admin"() OR (("profile_id" = "auth"."uid"()) AND ("is_active" = ( SELECT "suppliers_1"."is_active"
   FROM "public"."suppliers" "suppliers_1"
  WHERE ("suppliers_1"."id" = "suppliers_1"."id"))) AND ("profile_id" = ( SELECT "suppliers_1"."profile_id"
   FROM "public"."suppliers" "suppliers_1"
  WHERE ("suppliers_1"."id" = "suppliers_1"."id"))))));



ALTER TABLE "public"."user_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."accept_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_reassign_order"("p_order_id" "uuid", "p_new_supplier_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_reassign_order"("p_order_id" "uuid", "p_new_supplier_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reassign_order"("p_order_id" "uuid", "p_new_supplier_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_supplier_status"("p_supplier_id" "uuid", "p_is_active" boolean, "p_is_verified" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_supplier_status"("p_supplier_id" "uuid", "p_is_active" boolean, "p_is_verified" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_supplier_status"("p_supplier_id" "uuid", "p_is_active" boolean, "p_is_verified" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_distance_km"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_distance_km"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_distance_km"("lat1" double precision, "lon1" double precision, "lat2" double precision, "lon2" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_price" numeric, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_price" numeric, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_delivery"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_price" numeric, "p_jars_delivered" integer, "p_jars_returned" integer, "p_amount_collected" numeric, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_delivery_schedule"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_interval_days" integer, "p_first_delivery_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_delivery_schedule"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_interval_days" integer, "p_first_delivery_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_delivery_schedule"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_quantity" integer, "p_interval_days" integer, "p_first_delivery_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_normalized_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_normalized_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_normalized_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text", "p_landmark" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text", "p_landmark" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_supplier_customer"("p_name" "text", "p_phone" "text", "p_customer_type" "public"."customer_type_enum", "p_address" "text", "p_sector" "text", "p_landmark" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_daily_run"("p_supplier_id" "uuid", "p_run_date" "date", "p_vehicle_id" "uuid", "p_driver_id" "uuid", "p_schedule_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_daily_run"("p_supplier_id" "uuid", "p_run_date" "date", "p_vehicle_id" "uuid", "p_driver_id" "uuid", "p_schedule_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_daily_run"("p_supplier_id" "uuid", "p_run_date" "date", "p_vehicle_id" "uuid", "p_driver_id" "uuid", "p_schedule_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_display_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_display_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_display_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_customer_network_view"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_customer_network_view"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_customer_network_view"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_network_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_network_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_network_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_network_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_network_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_network_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_operational_alerts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_operational_alerts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_operational_alerts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_orders"("p_date" "date", "p_supplier_id" "uuid", "p_status" "text", "p_sector" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_orders"("p_date" "date", "p_supplier_id" "uuid", "p_status" "text", "p_sector" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_orders"("p_date" "date", "p_supplier_id" "uuid", "p_status" "text", "p_sector" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_suppliers_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_suppliers_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_suppliers_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_suppliers"("p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_suppliers"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_suppliers"("p_lat" double precision, "p_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_ledger"("p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_ledger"("p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_ledger"("p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_effective_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_jar_activity"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_jar_activity"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_jar_activity"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_network_health_risks"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_network_health_risks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_network_health_risks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reassignment_candidates"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_reassignment_candidates"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reassignment_candidates"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_current_capacity"("p_supplier_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_current_capacity"("p_supplier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_current_capacity"("p_supplier_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_customers"("p_search" "text", "p_customer_type" "public"."customer_type_enum", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_customers"("p_search" "text", "p_customer_type" "public"."customer_type_enum", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_customers"("p_search" "text", "p_customer_type" "public"."customer_type_enum", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_details_for_customer"("p_supplier_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_details_for_customer"("p_supplier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_details_for_customer"("p_supplier_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_forecast"("p_supplier_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_forecast"("p_supplier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_forecast"("p_supplier_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_inventory_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_inventory_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_inventory_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_today"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_today_manifest"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_today_manifest"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_today_manifest"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_customer_arrival"("p_stop_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_customer_arrival"("p_stop_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_customer_arrival"("p_stop_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_customer_arrival_by_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_customer_arrival_by_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_customer_arrival_by_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order"("p_supplier_id" "uuid", "p_address_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_payment_method" "text", "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_vehicle_location"("p_run_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_speed" double precision, "p_accuracy_m" double precision, "p_heading" double precision, "p_altitude" double precision, "p_captured_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."process_vehicle_location"("p_run_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_speed" double precision, "p_accuracy_m" double precision, "p_heading" double precision, "p_altitude" double precision, "p_captured_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_vehicle_location"("p_run_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_speed" double precision, "p_accuracy_m" double precision, "p_heading" double precision, "p_altitude" double precision, "p_captured_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_inventory_purchase"("p_quantity" integer, "p_unit_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."record_inventory_purchase"("p_quantity" integer, "p_unit_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_inventory_purchase"("p_quantity" integer, "p_unit_price" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_ledger_payment"("p_customer_id" "uuid", "p_amount" numeric, "p_payment_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_ledger_payment"("p_customer_id" "uuid", "p_amount" numeric, "p_payment_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_ledger_payment"("p_customer_id" "uuid", "p_amount" numeric, "p_payment_method" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_manual_jar_adjustment"("p_customer_id" "uuid", "p_jars_returned" integer, "p_jars_delivered" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_manual_jar_adjustment"("p_customer_id" "uuid", "p_jars_returned" integer, "p_jars_delivered" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_manual_jar_adjustment"("p_customer_id" "uuid", "p_jars_returned" integer, "p_jars_delivered" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_order"("p_order_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_order"("p_order_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_order"("p_order_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."set_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_customer_price"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_price" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_delivery_schedule_status"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_delivery_schedule_status"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_delivery_schedule_status"("p_customer_id" "uuid", "p_supplier_product_id" "uuid", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_supplier_capacity"("p_date" "date", "p_max_capacity" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_supplier_capacity"("p_date" "date", "p_max_capacity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_supplier_capacity"("p_date" "date", "p_max_capacity" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_supplier_product"("p_product_id" "uuid", "p_price" numeric, "p_available" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_supplier_product"("p_product_id" "uuid", "p_price" numeric, "p_available" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_supplier_product"("p_product_id" "uuid", "p_price" numeric, "p_available" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_push_notification_edge_function"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_push_notification_edge_function"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_push_notification_edge_function"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_stop_status"("p_stop_id" "uuid", "p_status" "public"."delivery_stop_status", "p_skip_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_stop_status"("p_stop_id" "uuid", "p_status" "public"."delivery_stop_status", "p_skip_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stop_status"("p_stop_id" "uuid", "p_status" "public"."delivery_stop_status", "p_skip_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_supplier_location"("p_supplier_id" "uuid", "p_lng" double precision, "p_lat" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."update_supplier_location"("p_supplier_id" "uuid", "p_lng" double precision, "p_lat" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_supplier_location"("p_supplier_id" "uuid", "p_lng" double precision, "p_lat" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_supplier_profile"("p_business_name" "text", "p_description" "text", "p_phone" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision, "p_is_accepting_orders" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_supplier_profile"("p_business_name" "text", "p_description" "text", "p_phone" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision, "p_is_accepting_orders" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_supplier_profile"("p_business_name" "text", "p_description" "text", "p_phone" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision, "p_is_accepting_orders" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."addresses" TO "anon";
GRANT ALL ON TABLE "public"."addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."addresses" TO "service_role";



GRANT ALL ON TABLE "public"."api_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."api_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."api_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."customer_delivery_schedules" TO "anon";
GRANT ALL ON TABLE "public"."customer_delivery_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_delivery_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."customer_jar_balances" TO "anon";
GRANT ALL ON TABLE "public"."customer_jar_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_jar_balances" TO "service_role";



GRANT ALL ON TABLE "public"."customer_ledger_entries" TO "anon";
GRANT ALL ON TABLE "public"."customer_ledger_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_ledger_entries" TO "service_role";



GRANT ALL ON TABLE "public"."customer_product_prices" TO "anon";
GRANT ALL ON TABLE "public"."customer_product_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_product_prices" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_items" TO "anon";
GRANT ALL ON TABLE "public"."delivery_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_items" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_notifications" TO "anon";
GRANT ALL ON TABLE "public"."delivery_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_run_stops" TO "anon";
GRANT ALL ON TABLE "public"."delivery_run_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_run_stops" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_runs" TO "anon";
GRANT ALL ON TABLE "public"."delivery_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_runs" TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "anon";
GRANT ALL ON TABLE "public"."drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON TABLE "public"."jar_transactions" TO "anon";
GRANT ALL ON TABLE "public"."jar_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."jar_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_display_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_display_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_display_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_capacity" TO "anon";
GRANT ALL ON TABLE "public"."supplier_capacity" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_capacity" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_capacity_view" TO "anon";
GRANT ALL ON TABLE "public"."supplier_capacity_view" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_capacity_view" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_customers" TO "anon";
GRANT ALL ON TABLE "public"."supplier_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_customers" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_financial_reconciliation" TO "anon";
GRANT ALL ON TABLE "public"."supplier_financial_reconciliation" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_financial_reconciliation" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_inventory" TO "anon";
GRANT ALL ON TABLE "public"."supplier_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_inventory_transactions" TO "anon";
GRANT ALL ON TABLE "public"."supplier_inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_jar_reconciliation" TO "anon";
GRANT ALL ON TABLE "public"."supplier_jar_reconciliation" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_jar_reconciliation" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_products" TO "anon";
GRANT ALL ON TABLE "public"."supplier_products" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_products" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_schedule_integrity" TO "anon";
GRANT ALL ON TABLE "public"."supplier_schedule_integrity" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_schedule_integrity" TO "service_role";



GRANT ALL ON TABLE "public"."user_devices" TO "anon";
GRANT ALL ON TABLE "public"."user_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."user_devices" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_assignments" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_locations" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_locations" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































