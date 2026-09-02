ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payouts_checked_at timestamptz;

ALTER TABLE public.ride_payments
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS transfer_group text;

CREATE OR REPLACE FUNCTION public.is_ride_paid(_ride_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ride_payments p
    WHERE p.ride_id = _ride_id AND p.status IN ('held', 'released')
  );
$$;

DROP POLICY IF EXISTS rides_driver_select ON public.rides;
CREATE POLICY rides_driver_select ON public.rides FOR SELECT TO authenticated
USING (
  public.is_driver(auth.uid())
  AND (
    driver_id = auth.uid()
    OR (status = 'pending' AND public.is_ride_paid(id))
  )
);

DROP POLICY IF EXISTS rides_driver_update ON public.rides;
CREATE POLICY rides_driver_update ON public.rides FOR UPDATE TO authenticated
USING (
  public.is_driver(auth.uid())
  AND (
    driver_id = auth.uid()
    OR (status = 'pending' AND public.is_ride_paid(id))
  )
)
WITH CHECK (public.is_driver(auth.uid()) AND driver_id = auth.uid());

CREATE POLICY rides_tutor_delete ON public.rides FOR DELETE TO authenticated
USING (auth.uid() = tutor_id);

GRANT DELETE ON public.rides TO authenticated;