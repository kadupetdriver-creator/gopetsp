-- ===== profiles: novos campos =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Guard do perfil: admin passa; usuário comum não altera is_active.
CREATE OR REPLACE FUNCTION public.guard_profiles_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR auth.uid() IS NULL
     OR coalesce(current_setting('gopet.bypass_profile_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    -- Admin edita dados, endereço e ativação; campos financeiros e identidade seguem protegidos.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
       OR NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled
       OR NEW.payouts_checked_at IS DISTINCT FROM OLD.payouts_checked_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Campos financeiros do perfil não podem ser alterados diretamente';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
     OR NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled
     OR NEW.payouts_checked_at IS DISTINCT FROM OLD.payouts_checked_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Campos privilegiados do perfil não podem ser alterados pelo usuário';
  END IF;

  RETURN NEW;
END; $$;

-- ===== Políticas de admin =====
GRANT DELETE ON public.profiles TO authenticated;
GRANT DELETE ON public.drivers TO authenticated;

DROP POLICY IF EXISTS profiles_admin_select ON public.profiles;
CREATE POLICY profiles_admin_select ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
CREATE POLICY profiles_admin_delete ON public.profiles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS drivers_admin_update ON public.drivers;
CREATE POLICY drivers_admin_update ON public.drivers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS drivers_admin_delete ON public.drivers;
CREATE POLICY drivers_admin_delete ON public.drivers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS vehicles_admin_all ON public.vehicles;
CREATE POLICY vehicles_admin_all ON public.vehicles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS driver_documents_admin_delete ON public.driver_documents;
CREATE POLICY driver_documents_admin_delete ON public.driver_documents
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS rides_admin_select ON public.rides;
CREATE POLICY rides_admin_select ON public.rides
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS rides_admin_update ON public.rides;
CREATE POLICY rides_admin_update ON public.rides
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS rides_admin_delete ON public.rides;
CREATE POLICY rides_admin_delete ON public.rides
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS ride_payments_admin_select ON public.ride_payments;
CREATE POLICY ride_payments_admin_select ON public.ride_payments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===== Guard de corridas: admin passa, mas sem tocar em campos financeiros derivados =====
CREATE OR REPLACE FUNCTION public.guard_rides_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role'
     OR uid IS NULL
     OR coalesce(current_setting('gopet.bypass_ride_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(uid, 'admin') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.share_token IS DISTINCT FROM OLD.share_token
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Identificadores da corrida não podem ser alterados';
    END IF;
    IF NEW.price_cents IS DISTINCT FROM OLD.price_cents
       AND EXISTS (SELECT 1 FROM public.ride_payments p
                   WHERE p.ride_id = OLD.id AND p.status IN ('held','released','refunded')) THEN
      RAISE EXCEPTION 'O valor não pode ser alterado após o pagamento da corrida';
    END IF;
    IF NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id
       AND NOT public.is_driver(NEW.driver_id) THEN
      RAISE EXCEPTION 'O usuário informado não é um motorista aprovado';
    END IF;
    IF NEW.tutor_id IS DISTINCT FROM OLD.tutor_id
       AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.tutor_id) THEN
      RAISE EXCEPTION 'Tutor não encontrado';
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
$$;

-- ===== Revisão de motoristas: inclui suspensão e reabertura =====
CREATE OR REPLACE FUNCTION public.review_driver_application(
  _driver_id uuid,
  _status public.driver_status,
  _reason text DEFAULT NULL
)
RETURNS public.drivers
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  d public.drivers;
  v public.vehicles;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar cadastros de motoristas';
  END IF;
  IF _status IN ('rejeitado', 'suspenso') AND coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo';
  END IF;

  UPDATE public.drivers
     SET status = _status,
         rejection_reason = CASE WHEN _status IN ('rejeitado','suspenso') THEN btrim(_reason) ELSE NULL END,
         reviewed_at = now(),
         reviewed_by = uid
   WHERE id = _driver_id
  RETURNING * INTO d;

  IF d.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro de motorista não encontrado';
  END IF;

  PERFORM set_config('gopet.bypass_profile_guard', 'on', true);
  IF _status = 'aprovado' THEN
    SELECT * INTO v FROM public.vehicles WHERE driver_id = d.id LIMIT 1;
    UPDATE public.profiles
       SET role = 'driver'::public.app_role,
           full_name = CASE WHEN coalesce(full_name, '') = '' THEN d.full_name ELSE full_name END,
           phone = coalesce(phone, d.phone),
           vehicle_model = coalesce(nullif(concat_ws(' ', v.brand, v.model, v.year::text), ''), vehicle_model),
           vehicle_plate = coalesce(v.plate, vehicle_plate)
     WHERE id = d.user_id;
  ELSE
    UPDATE public.profiles
       SET role = 'tutor'::public.app_role
     WHERE id = d.user_id AND role = 'driver'::public.app_role;
  END IF;
  PERFORM set_config('gopet.bypass_profile_guard', 'off', true);

  RETURN d;
END;
$$;

-- ===== Contas desativadas não aceitam corridas =====
CREATE OR REPLACE FUNCTION public.accept_ride(_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql SECURITY DEFINER
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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_active) THEN
    RAISE EXCEPTION 'Sua conta está desativada. Fale com o suporte GoPet';
  END IF;
  IF NOT private.is_ride_paid(_ride_id) THEN
    RAISE EXCEPTION 'Esta corrida ainda não foi paga';
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

-- ===== E-mails dos usuários (somente admin) =====
CREATE OR REPLACE FUNCTION public.admin_user_emails()
RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email::text, u.last_sign_in_at
  FROM auth.users u
  WHERE public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.admin_user_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_emails() TO authenticated, service_role;