ALTER TABLE public.mercadopago_payments
ADD COLUMN refund_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX mercadopago_payments_refund_key_uniq
ON public.mercadopago_payments (refund_idempotency_key);