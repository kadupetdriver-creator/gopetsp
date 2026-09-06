-- 1) Trava de colunas em rides -------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_rides_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Chamadas privilegiadas (service_role / funções seguras) passam direto.
  IF auth.role() = 'service_role'
     OR uid IS NULL
     OR coalesce(current_setting('gopet.bypass_ride_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Motorista: somente localização em tempo real.
  IF OLD.driver_id IS NOT NULL AND uid = OLD.driver_id AND uid <> OLD.tutor_id THEN
    IF (NEW.tutor_id, NEW.driver_id, NEW.pet_id, NEW.pet_name, NEW.pet_size, NEW.service_type,
        NEW.origin_address, NEW.origin_neighborhood, NEW.destination_address, NEW.destination_neighborhood,
        NEW.origin_lat, NEW.origin_lng, NEW.destination_lat, NEW.destination_lng,
        NEW.scheduled_at, NEW.notes, NEW.price_cents, NEW.distance_km, NEW.status,
        NEW.share_token, NEW.needs_trunk, NEW.trunk_fee_cents, NEW.created_at)
       IS DISTINCT FROM
       (OLD.tutor_id, OLD.driver_id, OLD.pet_id, OLD.pet_name, OLD.pet_size, OLD.service_type,
        OLD.origin_address, OLD.origin_neighborhood, OLD.destination_address, OLD.destination_neighborhood,
        OLD.origin_lat, OLD.origin_lng, OLD.destination_lat, OLD.destination_lng,
        OLD.scheduled_at, OLD.notes, OLD.price_cents, OLD.distance_km, OLD.status,
        OLD.share_token, OLD.needs_trunk, OLD.trunk_fee_cents, OLD.created_at)
    THEN
      RAISE EXCEPTION 'Motorista pode atualizar apenas a localização da corrida';
    END IF;
    RETURN NEW;
  END IF;

  -- Tutor: apenas dados da solicitação e apenas enquanto pendente.
  IF uid = OLD.tutor_id THEN
    IF (NEW.tutor_id, NEW.driver_id, NEW.price_cents, NEW.distance_km, NEW.status,
        NEW.driver_lat, NEW.driver_lng, NEW.location_updated_at,
        NEW.share_token, NEW.needs_trunk, NEW.trunk_fee_cents, NEW.created_at)
       IS DISTINCT FROM
       (OLD.tutor_id, OLD.driver_id, OLD.price_cents, OLD.distance_km, OLD.status,
        OLD.driver_lat, OLD.driver_lng, OLD.location_updated_at,
        OLD.share_token, OLD.needs_trunk, OLD.trunk_fee_cents, OLD.created_at)
    THEN
      RAISE EXCEPTION 'Estes campos da corrida não podem ser alterados diretamente';
    END IF;

    IF OLD.status <> 'pending'::ride_status THEN
      RAISE EXCEPTION 'A corrida só pode ser editada enquanto aguarda motorista';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Sem permissão para alterar esta corrida';
END;
$$;

DROP TRIGGER IF EXISTS rides_guard_update ON public.rides;
CREATE TRIGGER rides_guard_update
BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.guard_rides_update();

-- 2) Aceite atômico ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_ride(_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated public.rides;
  current_status ride_status;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;
  IF NOT public.is_driver(uid) THEN
    RAISE EXCEPTION 'Apenas motoristas parceiros podem aceitar corridas';
  END IF;
  IF NOT private.is_ride_paid(_ride_id) THEN
    RAISE EXCEPTION 'Esta corrida ainda não foi paga';
  END IF;

  PERFORM set_config('gopet.bypass_ride_guard', 'on', true);

  UPDATE public.rides
     SET status = 'accepted'::ride_status,
         driver_id = uid
   WHERE id = _ride_id
     AND status = 'pending'::ride_status
     AND driver_id IS NULL
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
GRANT EXECUTE ON FUNCTION public.accept_ride(uuid) TO authenticated;

-- 3) Mudança de status validada -------------------------------------------------
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

  -- Cancelamento: tutor em qualquer etapa ativa; motorista após aceitar.
  IF _status = 'cancelled'::ride_status THEN
    IF ride.status IN ('pending','accepted','en_route','in_progress') THEN
      allowed := is_tutor OR (is_driver_of_ride AND ride.status <> 'pending'::ride_status);
    END IF;
  ELSIF is_driver_of_ride THEN
    allowed := (ride.status = 'accepted'::ride_status    AND _status = 'en_route'::ride_status)
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