CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_ride_paid(_ride_id uuid)
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

REVOKE ALL ON FUNCTION private.is_ride_paid(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS rides_driver_select ON public.rides;
CREATE POLICY rides_driver_select ON public.rides FOR SELECT TO authenticated
USING (
  public.is_driver(auth.uid())
  AND (driver_id = auth.uid() OR (status = 'pending' AND private.is_ride_paid(id)))
);

DROP POLICY IF EXISTS rides_driver_update ON public.rides;
CREATE POLICY rides_driver_update ON public.rides FOR UPDATE TO authenticated
USING (
  public.is_driver(auth.uid())
  AND (driver_id = auth.uid() OR (status = 'pending' AND private.is_ride_paid(id)))
)
WITH CHECK (public.is_driver(auth.uid()) AND driver_id = auth.uid());

DROP FUNCTION IF EXISTS public.is_ride_paid(uuid);