-- Cadastro "Quero ser motorista": o perfil já nasce como motorista.
-- O papel vem dos metadados do cadastro; só 'tutor' e 'driver' são aceitos
-- (nunca 'admin'), com 'tutor' como padrão.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _cpf text := nullif(regexp_replace(coalesce(NEW.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g'), '');
  _ref text := nullif(upper(trim(coalesce(NEW.raw_user_meta_data ->> 'referral_code', ''))), '');
  _role public.app_role := CASE
    WHEN NEW.raw_user_meta_data ->> 'role' = 'driver' THEN 'driver'::public.app_role
    ELSE 'tutor'::public.app_role
  END;
  _referrer uuid;
BEGIN
  IF _cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE cpf = _cpf) THEN
    RAISE EXCEPTION 'Já existe uma conta cadastrada com este CPF';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role, cpf)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.raw_user_meta_data ->> 'phone',
          _role, _cpf)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.referral_codes (user_id, code) VALUES (NEW.id, public.generate_referral_code())
  ON CONFLICT DO NOTHING;

  IF _ref IS NOT NULL THEN
    SELECT user_id INTO _referrer FROM public.referral_codes WHERE code = _ref;
    IF _referrer IS NOT NULL AND _referrer <> NEW.id THEN
      INSERT INTO public.referrals (referrer_id, referred_id, code) VALUES (_referrer, NEW.id, _ref)
      ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- Como o perfil agora pode nascer como motorista antes da análise dos documentos,
-- is_driver passa a exigir cadastro de motorista APROVADO. Assim, corridas pagas
-- pendentes, aceite de chamadas e dados do tutor continuam restritos a quem foi
-- aprovado pela administração. Motoristas antigos já têm registro aprovado
-- (backfill da migração 20260910010337).
CREATE OR REPLACE FUNCTION public.is_driver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.drivers d ON d.user_id = p.id
    WHERE p.id = _user_id
      AND p.role = 'driver'::public.app_role
      AND d.status = 'aprovado'::public.driver_status
  );
$function$;

REVOKE ALL ON FUNCTION public.is_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_driver(uuid) TO authenticated, service_role;