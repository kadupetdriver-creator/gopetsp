CREATE OR REPLACE FUNCTION public.accept_ride(_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated public.rides;
  current_status ride_status;
  target_at timestamptz;
  conflict_at timestamptz;
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

  SELECT scheduled_at INTO target_at FROM public.rides WHERE id = _ride_id;
  IF target_at IS NULL THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  SELECT r.scheduled_at INTO conflict_at
  FROM public.rides r
  WHERE r.driver_id = uid
    AND r.id <> _ride_id
    AND r.status IN ('accepted'::ride_status, 'en_route'::ride_status, 'in_progress'::ride_status)
    AND r.scheduled_at > target_at - interval '60 minutes'
    AND r.scheduled_at < target_at + interval '60 minutes'
  LIMIT 1;

  IF conflict_at IS NOT NULL THEN
    RAISE EXCEPTION 'Você já tem uma corrida agendada para %. Não é possível aceitar duas corridas no mesmo horário.',
      to_char(conflict_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  END IF;

  PERFORM set_config('gopet.bypass_ride_guard', 'on', true);
  UPDATE public.rides
     SET status = 'accepted'::ride_status, driver_id = uid
   WHERE id = _ride_id AND status = 'pending'::ride_status AND driver_id IS NULL
  RETURNING * INTO updated;
  PERFORM set_config('gopet.bypass_ride_guard', 'off', true);

  IF updated.id IS NULL THEN
    SELECT status INTO current_status FROM public.rides WHERE id = _ride_id;
    IF current_status IS NULL THEN
      RAISE EXCEPTION 'Corrida não encontrada';
    END IF;
    RAISE EXCEPTION 'Esta corrida já foi aceita por outro motorista';
  END IF;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_ride(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ride(uuid) TO authenticated, service_role;