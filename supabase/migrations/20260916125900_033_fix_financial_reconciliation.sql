-- 033_fix_financial_reconciliation.sql
-- Fix supplier_financial_reconciliation to correctly account for adjustments

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
        COALESCE((SELECT SUM(amount) FROM public.customer_ledger_entries WHERE supplier_id = s.id AND entry_type = 'debit' AND reference_type = 'delivery'), 0)
    ) AS is_billing_synced,
    
    (
        COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.supplier_id = s.id), 0) = 
        COALESCE((SELECT SUM(amount) FROM public.customer_ledger_entries WHERE supplier_id = s.id AND entry_type = 'credit' AND reference_type = 'payment'), 0)
    ) AS is_collection_synced
FROM public.suppliers s;
