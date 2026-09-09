-- security_harden_profiles_roles_and_rls

-- 1) Cadastro: papel sempre 'tutor', independentemente de metadata do cliente
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    'tutor'::public.app_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2) Trigger: bloqueia alteração de campos privilegiados por usuários comuns
CREATE OR REPLACE FUNCTION public.guard_profiles_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'service_role'
     OR auth.uid() IS NULL
     OR coalesce(current_setting('gopet.bypass_profile_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
     OR NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled
     OR NEW.payouts_checked_at IS DISTINCT FROM OLD.payouts_checked_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Campos privilegiados do perfil não podem ser alterados pelo usuário';
  END IF;

  RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.guard_profiles_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_update ON public.profiles;
CREATE TRIGGER profiles_guard_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_update();

-- 3) Policies de profiles
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND role = 'tutor'::public.app_role
    AND stripe_account_id IS NULL
    AND payouts_enabled = false
    AND payouts_checked_at IS NULL
  );

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4) Privilégios de tabela: nada para anon, sem DELETE para authenticated
REVOKE ALL ON public.profiles FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 5) is_driver e funções de autorização: search_path seguro e EXECUTE restrito
CREATE OR REPLACE FUNCTION public.is_driver(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'driver'::public.app_role);
$function$;

REVOKE ALL ON FUNCTION public.is_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_driver(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_ride_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_ride_participant(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accept_ride(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ride(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_ride_status(uuid, public.ride_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ride_status(uuid, public.ride_status) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.my_credit_balance_cents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_credit_balance_cents() TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.can_view_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_profile(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_ride_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_ride_paid(uuid) TO authenticated, service_role;

-- 6) Mecanismo administrativo (schema private, não exposto pela API)
CREATE OR REPLACE FUNCTION private.set_user_role(_user_id uuid, _role public.app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM set_config('gopet.bypass_profile_guard', 'on', true);
  UPDATE public.profiles SET role = _role WHERE id = _user_id;
  PERFORM set_config('gopet.bypass_profile_guard', 'off', true);
END; $function$;
REVOKE ALL ON FUNCTION private.set_user_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_user_role(uuid, public.app_role) TO service_role;