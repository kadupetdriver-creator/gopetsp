CREATE TABLE public.driver_ride_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ride_id uuid NOT NULL UNIQUE REFERENCES public.rides(id),
 driver_id uuid NOT NULL REFERENCES public.profiles(id),
 amount_cents integer NOT NULL CHECK (amount_cents > 0),
 paid_at timestamptz NOT NULL,
 recorded_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.driver_ride_payments TO authenticated;
GRANT ALL ON public.driver_ride_payments TO service_role;
ALTER TABLE public.driver_ride_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers read own ride payments" ON public.driver_ride_payments FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Admins read ride payments" ON public.driver_ride_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX driver_ride_payments_driver_idx ON public.driver_ride_payments(driver_id);
COMMENT ON TABLE public.driver_ride_payments IS 'Manual confirmation of GoPet payment to drivers, separate from tutor rides.paid_at. Missing record means unconfirmed, not paid.';