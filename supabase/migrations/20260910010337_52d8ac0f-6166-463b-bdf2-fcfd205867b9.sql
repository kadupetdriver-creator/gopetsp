-- 1) Admin só edita status e motorista da corrida
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

  IF public.has_role(uid, 'admin') THEN
    -- Somente campos operacionais: status e motorista vinculado.
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
$function$;

-- Permissão de UPDATE por coluna: financeiro e identificadores ficam fora do alcance do app.
REVOKE UPDATE ON public.rides FROM authenticated;
GRANT UPDATE (
  status, driver_id,
  pet_id, pet_name, pet_size, service_type,
  origin_address, origin_neighborhood, destination_address, destination_neighborhood,
  origin_lat, origin_lng, destination_lat, destination_lng,
  scheduled_at, notes,
  driver_lat, driver_lng, location_updated_at,
  updated_at
) ON public.rides TO authenticated;

-- 2) Uma única solicitação de motorista por conta (já garantido por UNIQUE, reforço idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.drivers'::regclass AND contype = 'u'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.drivers'::regclass AND attname='user_id')]
  ) THEN
    ALTER TABLE public.drivers ADD CONSTRAINT drivers_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- Motoristas do fluxo antigo (perfil já como motorista, sem solicitação) passam a contar como aprovados.
INSERT INTO public.drivers (user_id, full_name, cpf, birth_date, phone, email, city, neighborhood, status, submitted_at, reviewed_at)
SELECT p.id, coalesce(nullif(p.full_name,''), 'Motorista GoPet'), '', DATE '1900-01-01',
       coalesce(p.phone, ''), coalesce(u.email::text, ''), coalesce(nullif(p.city,''), 'São Paulo'), '',
       'aprovado', p.created_at, now()
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.drivers d ON d.user_id = p.id
WHERE p.role = 'driver'::public.app_role AND d.id IS NULL;