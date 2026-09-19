ALTER TABLE public.mercadopago_payments RENAME COLUMN mp_payment_id TO mp_order_id;
ALTER TABLE public.mercadopago_payments DROP CONSTRAINT IF EXISTS mercadopago_payments_payment_method_check;
ALTER TABLE public.mercadopago_payments DROP CONSTRAINT IF EXISTS mercadopago_payments_status_check;
ALTER TABLE public.mercadopago_payments ADD CONSTRAINT mercadopago_payments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'in_process'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'refunded'::text, 'expired'::text]));