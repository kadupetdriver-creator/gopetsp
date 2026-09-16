ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique ON public.profiles (cpf) WHERE cpf IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _cpf text := nullif(regexp_replace(coalesce(NEW.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g'), '');
BEGIN
  IF _cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE cpf = _cpf) THEN
    RAISE EXCEPTION 'Já existe uma conta cadastrada com este CPF';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role, cpf)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    'tutor'::public.app_role,
    _cpf
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $function$;

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

  IF public.has_role(auth.uid(), 'admin') THEN
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
     OR NEW.cpf IS DISTINCT FROM OLD.cpf
     OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
     OR NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled
     OR NEW.payouts_checked_at IS DISTINCT FROM OLD.payouts_checked_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Campos privilegiados do perfil não podem ser alterados pelo usuário';
  END IF;

  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.cpf_disponivel(_cpf text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE cpf = nullif(regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'), '')
  );
$function$;

REVOKE ALL ON FUNCTION public.cpf_disponivel(text) FROM public;
GRANT EXECUTE ON FUNCTION public.cpf_disponivel(text) TO anon, authenticated, service_role;