ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS en_route_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_ride_en_route_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'en_route'::ride_status AND OLD.status IS DISTINCT FROM 'en_route'::ride_status AND NEW.en_route_at IS NULL THEN
    NEW.en_route_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_stamp_ride_en_route_at ON public.rides;
CREATE TRIGGER zz_stamp_ride_en_route_at BEFORE UPDATE OF status ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.stamp_ride_en_route_at();

CREATE TABLE public.ride_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE REFERENCES public.rides(id),
  tutor_id uuid NOT NULL,
  driver_id uuid,
  cancelled_by uuid NOT NULL,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz NOT NULL,
  reason text,
  previous_status text NOT NULL,
  driver_state text NOT NULL,
  en_route_at timestamptz,
  arrived_at timestamptz,
  was_paid boolean NOT NULL DEFAULT false,
  tier text NOT NULL,
  rate_percent integer NOT NULL,
  ride_price_cents integer NOT NULL,
  fee_cents integer NOT NULL,
  refund_cents integer NOT NULL,
  driver_share_cents integer NOT NULL,
  fees_active boolean NOT NULL DEFAULT false,
  exception_kind text,
  exception_notes text,
  exception_by uuid,
  exception_at timestamptz,
  original_fee_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ride_cancellations TO authenticated;
GRANT ALL ON public.ride_cancellations TO service_role;
ALTER TABLE public.ride_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tutor reads own cancellations" ON public.ride_cancellations
  FOR SELECT TO authenticated USING (auth.uid() = tutor_id);
CREATE POLICY "Admins read cancellations" ON public.ride_cancellations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ride_cancellations_updated_at BEFORE UPDATE ON public.ride_cancellations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();