ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_driver_arrived(_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ride public.rides;
  updated public.rides;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  SELECT * INTO ride FROM public.rides WHERE id = _ride_id;
  IF ride.id IS NULL THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF ride.driver_id IS NULL OR uid <> ride.driver_id THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta corrida';
  END IF;

  IF ride.status <> 'en_route'::ride_status THEN
    RAISE EXCEPTION 'Só é possível avisar a chegada quando a corrida está a caminho';
  END IF;

  IF ride.arrived_at IS NOT NULL THEN
    RETURN ride;
  END IF;

  PERFORM set_config('gopet.bypass_ride_guard', 'on', true);

  UPDATE public.rides
     SET arrived_at = now()
   WHERE id = _ride_id
     AND arrived_at IS NULL
  RETURNING * INTO updated;

  PERFORM set_config('gopet.bypass_ride_guard', 'off', true);

  IF updated.id IS NULL THEN
    SELECT * INTO updated FROM public.rides WHERE id = _ride_id;
  END IF;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_driver_arrived(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_driver_arrived(uuid) TO authenticated;