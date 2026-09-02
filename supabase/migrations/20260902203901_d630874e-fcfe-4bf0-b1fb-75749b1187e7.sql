CREATE TYPE public.payment_status AS ENUM ('pending', 'held', 'released', 'refunded', 'cancelled', 'failed');

CREATE TABLE public.ride_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES public.rides ON DELETE CASCADE,
  tutor_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  driver_id UUID REFERENCES auth.users ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  driver_amount_cents INTEGER NOT NULL,
  cancellation_fee_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  environment TEXT NOT NULL DEFAULT 'sandbox',
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  paid_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ride_payments_tutor_idx ON public.ride_payments (tutor_id, created_at DESC);
CREATE INDEX ride_payments_driver_idx ON public.ride_payments (driver_id, created_at DESC);
CREATE INDEX ride_payments_session_idx ON public.ride_payments (stripe_session_id);

GRANT SELECT ON public.ride_payments TO authenticated;
GRANT ALL ON public.ride_payments TO service_role;

ALTER TABLE public.ride_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_participants" ON public.ride_payments FOR SELECT TO authenticated
USING (tutor_id = auth.uid() OR driver_id = auth.uid());

CREATE TRIGGER ride_payments_updated_at BEFORE UPDATE ON public.ride_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_payments;