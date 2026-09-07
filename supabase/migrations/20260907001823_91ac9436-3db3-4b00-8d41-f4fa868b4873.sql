CREATE OR REPLACE FUNCTION public.set_ride_status(_ride_id uuid, _status ride_status)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ride public.rides;
  updated public.rides;
  is_tutor boolean;
  is_driver_of_ride boolean;
  allowed boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  SELECT * INTO ride FROM public.rides WHERE id = _ride_id;
  IF ride.id IS NULL THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  is_tutor := (uid = ride.tutor_id);
  is_driver_of_ride := (ride.driver_id IS NOT NULL AND uid = ride.driver_id);
  IF NOT (is_tutor OR is_driver_of_ride) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta corrida';
  END IF;

  IF _status = 'accepted'::ride_status THEN
    RAISE EXCEPTION 'Use a operação de aceite de corrida';
  END IF;

  IF _status = 'cancelled'::ride_status THEN
    IF ride.status IN ('pending','accepted','en_route','in_progress') THEN
      allowed := is_tutor OR (is_driver_of_ride AND ride.status <> 'pending'::ride_status);
    END IF;
  ELSIF is_driver_of_ride THEN
    allowed := (ride.status = 'accepted'::ride_status    AND _status = 'en_route'::ride_status)
            OR (ride.status = 'accepted'::ride_status    AND _status = 'in_progress'::ride_status)
            OR (ride.status = 'en_route'::ride_status    AND _status = 'in_progress'::ride_status)
            OR (ride.status = 'in_progress'::ride_status AND _status = 'completed'::ride_status);
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Transição de status inválida (% -> %)', ride.status, _status;
  END IF;

  PERFORM set_config('gopet.bypass_ride_guard', 'on', true);

  UPDATE public.rides
     SET status = _status
   WHERE id = _ride_id
     AND status = ride.status
  RETURNING * INTO updated;

  PERFORM set_config('gopet.bypass_ride_guard', 'off', true);

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'A corrida foi atualizada por outra operação. Tente novamente.';
  END IF;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ride_status(uuid, ride_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ride_status(uuid, ride_status) TO authenticated;