ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS has_return boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_waits boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiting_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiting_fee_cents integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.guard_rides_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role'
     OR uid IS NULL
     OR coalesce(current_setting('gopet.bypass_ride_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Campos de retorno/espera são definidos apenas na criação, pelo backend.
  IF (NEW.has_return, NEW.return_scheduled_at, NEW.return_fee_cents,
      NEW.driver_waits, NEW.waiting_minutes, NEW.waiting_fee_cents)
     IS DISTINCT FROM
     (OLD.has_return, OLD.return_scheduled_at, OLD.return_fee_cents,
      OLD.driver_waits, OLD.waiting_minutes, OLD.waiting_fee_cents)
  THEN
    RAISE EXCEPTION 'Retorno e espera da corrida não podem ser alterados diretamente';
  END IF;

  IF public.has_role(uid, 'admin') THEN
    IF (NEW.id, NEW.tutor_id, NEW.pet_id, NEW.pet_name, NEW.pet_size, NEW.service_type,
        NEW.origin_address, NEW.origin_neighborhood, NEW.destination_address, NEW.destination_neighborhood,
        NEW.origin_lat, NEW.origin_lng, NEW.destination_lat, NEW.destination_lng,
        NEW.scheduled_at, NEW.notes, NEW.price_cents, NEW.distance_km,
        NEW.driver_lat, NEW.driver_lng, NEW.location_updated_at,
        NEW.share_token, NEW.needs_trunk, NEW.trunk_fee_cents, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.tutor_id, OLD.pet_id, OLD.pet_name, OLD.pet_size, OLD.service_type,
        OLD.origin_address, OLD.origin_neighborhood, OLD.destination_address, OLD.destination_neighborhood,
        OLD.origin_lat, OLD.origin_lng, OLD.destination_lat, OLD.destination_lng,
        OLD.scheduled_at, OLD.notes, OLD.price_cents, OLD.distance_km,
        OLD.driver_lat, OLD.driver_lng, OLD.location_updated_at,
        OLD.share_token, OLD.needs_trunk, OLD.trunk_fee_cents, OLD.created_at)
    THEN
      RAISE EXCEPTION 'Administradores só podem alterar o status e o motorista da corrida';
    END IF;
    IF NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id
       AND NOT public.is_driver(NEW.driver_id) THEN
      RAISE EXCEPTION 'O usuário informado não é um motorista aprovado';
    END IF;
    IF OLD.status IN ('completed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Corridas concluídas ou canceladas não podem mudar de status';
    END IF;
    RETURN NEW;
  END IF;

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
$function$;