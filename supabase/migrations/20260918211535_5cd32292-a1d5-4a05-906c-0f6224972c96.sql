CREATE TABLE public.mercadopago_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mp_payment_id text,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'expired')),
  status_detail text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  qr_code text,
  qr_code_base64 text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

GRANT SELECT ON public.mercadopago_payments TO authenticated;
GRANT ALL ON public.mercadopago_payments TO service_role;

ALTER TABLE public.mercadopago_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mercadopago_payments_select_own"
ON public.mercadopago_payments
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

CREATE UNIQUE INDEX mercadopago_payments_mp_id_uniq
ON public.mercadopago_payments (mp_payment_id)
WHERE mp_payment_id IS NOT NULL;

CREATE INDEX mercadopago_payments_ride_created_idx
ON public.mercadopago_payments (ride_id, created_at DESC);

CREATE TRIGGER mercadopago_payments_updated_at
BEFORE UPDATE ON public.mercadopago_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mercadopago_payments;