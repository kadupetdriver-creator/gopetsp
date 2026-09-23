ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS preferred_driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferred_until timestamptz;

CREATE INDEX IF NOT EXISTS rides_preferred_driver_idx
  ON public.rides (preferred_driver_id, preferred_until)
  WHERE preferred_driver_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.list_preferred_drivers()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_path text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.user_id,
         d.full_name,
         d.avatar_path,
         v.brand,
         v.model,
         v.color
    FROM public.drivers d
    JOIN public.profiles p ON p.id = d.user_id
    LEFT JOIN public.vehicles v ON v.driver_id = d.id
   WHERE auth.uid() IS NOT NULL
     AND d.status = 'aprovado'::public.driver_status
     AND p.is_active = true
   ORDER BY d.full_name;
$$;
REVOKE ALL ON FUNCTION public.list_preferred_drivers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_preferred_drivers() TO authenticated, service_role;

DROP POLICY IF EXISTS rides_driver_select ON public.rides;
CREATE POLICY rides_driver_select ON public.rides
  FOR SELECT TO authenticated
  USING (
    public.is_driver(auth.uid())
    AND (
      driver_id = auth.uid()
      OR (
        status = 'pending'::public.ride_status
        AND private.is_ride_paid(id)
        AND (
          preferred_driver_id IS NULL
          OR preferred_driver_id = auth.uid()
          OR preferred_until IS NULL
          OR preferred_until <= now()
        )
      )
    )
  );

DROP POLICY IF EXISTS rides_driver_update ON public.rides;
CREATE POLICY rides_driver_update ON public.rides
  FOR UPDATE TO authenticated
  USING (
    public.is_driver(auth.uid())
    AND (
      driver_id = auth.uid()
      OR (
        status = 'pending'::public.ride_status
        AND private.is_ride_paid(id)
        AND (
          preferred_driver_id IS NULL
          OR preferred_driver_id = auth.uid()
          OR preferred_until IS NULL
          OR preferred_until <= now()
        )
      )
    )
  )
  WITH CHECK (public.is_driver(auth.uid()) AND driver_id = auth.uid());

CREATE OR REPLACE FUNCTION public.accept_ride(_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated public.rides;
  current_ride public.rides;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;
  IF NOT public.is_driver(uid) THEN
    RAISE EXCEPTION 'Apenas motoristas parceiros podem aceitar corridas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_active) THEN
    RAISE EXCEPTION 'Sua conta está desativada. Fale com o suporte GoPet';
  END IF;
  IF NOT private.is_ride_paid(_ride_id) THEN
    RAISE EXCEPTION 'Esta corrida ainda não foi paga';
  END IF;

  SELECT * INTO current_ride FROM public.rides WHERE id = _ride_id;
  IF current_ride.id IS NULL THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;
  IF current_ride.preferred_driver_id IS NOT NULL
     AND current_ride.preferred_driver_id <> uid
     AND current_ride.preferred_until IS NOT NULL
     AND current_ride.preferred_until > now() THEN
    RAISE EXCEPTION 'Esta corrida está reservada temporariamente ao motorista preferencial do tutor';
  END IF;

  PERFORM set_config('gopet.bypass_ride_guard', 'on', true);
  UPDATE public.rides
     SET status = 'accepted'::ride_status, driver_id = uid
   WHERE id = _ride_id
     AND status = 'pending'::ride_status
     AND driver_id IS NULL
     AND (
       preferred_driver_id IS NULL
       OR preferred_driver_id = uid
       OR preferred_until IS NULL
       OR preferred_until <= now()
     )
  RETURNING * INTO updated;
  PERFORM set_config('gopet.bypass_ride_guard', 'off', true);

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Esta corrida já foi aceita por outro motorista';
  END IF;
  RETURN updated;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_ride(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ride(uuid) TO authenticated, service_role;