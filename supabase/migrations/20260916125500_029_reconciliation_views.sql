-- 029_reconciliation_views.sql

-- 1. Jar Reconciliation View
CREATE OR REPLACE VIEW public.supplier_jar_reconciliation AS
SELECT 
    si.supplier_id,
    si.owned AS owned_jars,
    si.available AS available_jars,
    si.with_customers AS customer_jars,
    si.damaged AS damaged_jars,
    si.missing AS missing_jars,
    (
        si.owned = si.available + si.with_customers + si.damaged + si.missing
    ) AS is_equation_valid,
    -- Secondary check: Does the sum of customer balances match the inventory with_customers column?
    (
        si.with_customers = COALESCE((
            SELECT SUM(cjb.jars_with_customer)
            FROM public.customer_jar_balances cjb
            JOIN public.supplier_customers sc ON cjb.supplier_customer_id = sc.id
            WHERE sc.supplier_id = si.supplier_id
        ), 0)
    ) AS is_customer_sum_valid
FROM public.supplier_inventory si;


-- 2. Financial Reconciliation View
-- Validates that the Ledger accurately reflects Deliveries vs Payments
CREATE OR REPLACE VIEW public.supplier_financial_reconciliation AS
SELECT 
    s.id AS supplier_id,
    -- From primary tables
    COALESCE((SELECT SUM(total_amount) FROM public.deliveries d WHERE d.supplier_id = s.id), 0) AS total_billed,
    COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.supplier_id = s.id), 0) AS total_collected,
    
    -- From Ledger
    COALESCE((SELECT SUM(amount) FROM public.customer_ledger_entries WHERE supplier_id = s.id AND entry_type = 'debit'), 0) AS ledger_debits,
    COALESCE((SELECT SUM(amount) FROM public.customer_ledger_entries WHERE supplier_id = s.id AND entry_type = 'credit'), 0) AS ledger_credits,
    
    -- Assertions
    (
        COALESCE((SELECT SUM(total_amount) FROM public.deliveries d WHERE d.supplier_id = s.id), 0) = 
        COALESCE((SELECT SUM(amount) FROM public.customer_ledger_entries WHERE supplier_id = s.id AND entry_type = 'debit'), 0)
    ) AS is_billing_synced,
    
    (
        COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.supplier_id = s.id), 0) = 
        COALESCE((SELECT SUM(amount) FROM public.customer_ledger_entries WHERE supplier_id = s.id AND entry_type = 'credit'), 0)
    ) AS is_collection_synced
FROM public.suppliers s;


-- 3. Schedule Integrity View
CREATE OR REPLACE VIEW public.supplier_schedule_integrity AS
SELECT 
    s.id AS supplier_id,
    
    -- Duplicate Active Schedules: Multiple active schedules for the same customer + product
    (
        SELECT COUNT(*)
        FROM (
            SELECT supplier_customer_id, supplier_product_id
            FROM public.customer_delivery_schedules
            WHERE is_active = true
            GROUP BY supplier_customer_id, supplier_product_id
            HAVING COUNT(*) > 1
        ) duplicates
    ) AS duplicate_schedules_count,

    -- Duplicate Generated Deliveries (same customer, same product, same date)
    (
        SELECT COUNT(*)
        FROM (
            SELECT d.supplier_customer_id, di.supplier_product_id, d.delivery_date
            FROM public.deliveries d
            JOIN public.delivery_items di ON d.id = di.delivery_id
            WHERE d.supplier_id = s.id
            GROUP BY d.supplier_customer_id, di.supplier_product_id, d.delivery_date
            HAVING COUNT(*) > 1
        ) duplicates
    ) AS duplicate_deliveries_count,
    
    -- Deliveries without matching schedule
    (
        SELECT COUNT(*)
        FROM public.deliveries d
        JOIN public.delivery_items di ON d.id = di.delivery_id
        WHERE d.supplier_id = s.id
        AND NOT EXISTS (
            SELECT 1 FROM public.customer_delivery_schedules cds 
            WHERE cds.supplier_customer_id = d.supplier_customer_id 
            AND cds.supplier_product_id = di.supplier_product_id
        )
    ) AS orphan_deliveries_count

FROM public.suppliers s;
