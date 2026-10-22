CREATE OR REPLACE FUNCTION public.cpf_allows_multiple_accounts(_cpf text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $$ SELECT regexp_replace(coalesce(_cpf, ''), '\D', '', 'g') = '39729627894'; $$;

CREATE UNIQUE INDEX profiles_cpf_unique_except_registration_exception
ON public.profiles (cpf)
WHERE cpf IS NOT NULL AND NOT public.cpf_allows_multiple_accounts(cpf);
DROP INDEX public.profiles_cpf_unique;

CREATE OR REPLACE FUNCTION public.cpf_disponivel(_cpf text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.cpf_allows_multiple_accounts(_cpf) OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE cpf = nullif(regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  _cpf text := nullif(regexp_replace(coalesce(NEW.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g'), '');
  _ref text := nullif(upper(trim(coalesce(NEW.raw_user_meta_data ->> 'referral_code', ''))), '');
  _referrer uuid;
BEGIN
  IF _cpf IS NOT NULL AND NOT public.cpf_allows_multiple_accounts(_cpf)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE cpf = _cpf) THEN
    RAISE EXCEPTION 'Já existe uma conta cadastrada com este CPF';
  END IF;
  INSERT INTO public.profiles (id, full_name, phone, role, cpf)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.raw_user_meta_data ->> 'phone',
          'tutor'::public.app_role, _cpf)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.referral_codes (user_id, code) VALUES (NEW.id, public.generate_referral_code())
  ON CONFLICT DO NOTHING;
  PERFORM public.issue_welcome_coupon(NEW.id);
  IF _ref IS NOT NULL THEN
    SELECT user_id INTO _referrer FROM public.referral_codes WHERE code = _ref;
    IF _referrer IS NOT NULL AND _referrer <> NEW.id THEN
      INSERT INTO public.referrals (referrer_id, referred_id, code) VALUES (_referrer, NEW.id, _ref)
      ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;