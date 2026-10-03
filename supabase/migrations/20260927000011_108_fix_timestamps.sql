-- ============================================================================
-- 108_fix_timestamps.sql
-- Fixes the timezone double-shifting by replacing the Kolkata default with now()
-- and backdating corrupted data.
-- ============================================================================

-- 1. Fix the trigger that updates updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 2. Dynamically alter defaults and fix historical data
DO $$
DECLARE
    r RECORD;
    v_tables TEXT[] := ARRAY[]::TEXT[];
    v_table TEXT;
BEGIN
    -- Find all tables that have the corrupted default
    FOR r IN (
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND column_default ILIKE '%timezone(''Asia/Kolkata''%'
    ) LOOP
        v_tables := array_append(v_tables, r.table_name);
    END LOOP;

    -- For each affected table, fix the data and the defaults
    FOREACH v_table IN ARRAY v_tables LOOP
        
        -- Disable triggers temporarily so handle_updated_at doesn't fire and overwrite updated_at
        EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', v_table);

        -- Fix any column that has the bad default (usually created_at, updated_at)
        FOR r IN (
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = v_table
              AND (column_default ILIKE '%timezone(''Asia/Kolkata''%' OR column_name = 'updated_at')
              AND data_type IN ('timestamp with time zone', 'timestamp without time zone')
        ) LOOP
            -- Backdate the historical data
            EXECUTE format('UPDATE public.%I SET %I = %I - interval ''5 hours 30 minutes'' WHERE %I IS NOT NULL', v_table, r.column_name, r.column_name, r.column_name);
            
            -- Change the default to now()
            IF (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = v_table AND column_name = r.column_name) ILIKE '%timezone(''Asia/Kolkata''%' THEN
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT now()', v_table, r.column_name);
            END IF;
        END LOOP;

        -- Re-enable triggers
        EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', v_table);
        
    END LOOP;
END $$;
