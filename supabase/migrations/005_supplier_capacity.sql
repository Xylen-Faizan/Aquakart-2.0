-- 005_supplier_capacity.sql
-- Create supplier_capacity table and view

CREATE TABLE public.supplier_capacity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    max_capacity INT NOT NULL CHECK (max_capacity >= 0),
    reserved_quantity INT DEFAULT 0 NOT NULL CHECK (reserved_quantity >= 0),
    fulfilled_quantity INT DEFAULT 0 NOT NULL CHECK (fulfilled_quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Kolkata', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Kolkata', now()) NOT NULL,
    UNIQUE (supplier_id, date),
    CONSTRAINT capacity_not_exceeded CHECK (reserved_quantity + fulfilled_quantity <= max_capacity)
);

CREATE INDEX idx_supplier_capacity_supplier_date ON public.supplier_capacity(supplier_id, date);

CREATE VIEW public.supplier_capacity_view AS
SELECT
    id,
    supplier_id,
    date,
    max_capacity,
    reserved_quantity,
    fulfilled_quantity,
    (max_capacity - reserved_quantity - fulfilled_quantity) AS available_quantity,
    created_at,
    updated_at
FROM public.supplier_capacity;

CREATE TRIGGER supplier_capacity_updated_at
BEFORE UPDATE ON public.supplier_capacity
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
