CREATE TABLE public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_codes_select ON public.referral_codes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tutor_qualified_at timestamptz,
  driver_qualified_at timestamptz,
  CHECK (referrer_id <> referred_id)
);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_id);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referrals_select ON public.referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.referral_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  discount_percent integer NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','used','revoked')),
  used_ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  used_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_coupons_owner_idx ON public.referral_coupons(owner_id);
GRANT SELECT, UPDATE ON public.referral_coupons TO authenticated;
GRANT ALL ON public.referral_coupons TO service_role;
ALTER TABLE public.referral_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_coupons_select ON public.referral_coupons FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY referral_coupons_admin_update ON public.referral_coupons FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER referral_coupons_updated_at BEFORE UPDATE ON public.referral_coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.driver_referral_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 5000,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','revoked')),
  paid_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_referral_bonuses_driver_idx ON public.driver_referral_bonuses(driver_id);
GRANT SELECT, UPDATE ON public.driver_referral_bonuses TO authenticated;
GRANT ALL ON public.driver_referral_bonuses TO service_role;
ALTER TABLE public.driver_referral_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY driver_bonuses_select ON public.driver_referral_bonuses FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY driver_bonuses_admin_update ON public.driver_referral_bonuses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER driver_bonuses_updated_at BEFORE UPDATE ON public.driver_referral_bonuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mercadopago_payments ADD COLUMN coupon_id uuid REFERENCES public.referral_coupons(id) ON DELETE SET NULL;

-- Geração de códigos
CREATE OR REPLACE FUNCTION public.generate_referral_code() RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _c text; _chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  LOOP
    _c := 'GOPET-';
    FOR i IN 1..4 LOOP _c := _c || substr(_chars, 1 + floor(random()*length(_chars))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = _c)
          AND NOT EXISTS (SELECT 1 FROM public.referral_coupons WHERE code = _c);
  END LOOP;
  RETURN _c;
END; $$;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;

INSERT INTO public.referral_codes (user_id, code)
SELECT p.id, public.generate_referral_code() FROM public.profiles p
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _cpf text := nullif(regexp_replace(coalesce(NEW.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g'), '');
  _ref text := nullif(upper(trim(coalesce(NEW.raw_user_meta_data ->> 'referral_code', ''))), '');
  _referrer uuid;
BEGIN
  IF _cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE cpf = _cpf) THEN
    RAISE EXCEPTION 'Já existe uma conta cadastrada com este CPF';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role, cpf)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.raw_user_meta_data ->> 'phone',
          'tutor'::public.app_role, _cpf)
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

-- Validação pública (antes do cadastro) — só diz se existe
CREATE OR REPLACE FUNCTION public.referral_code_valid(_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = upper(trim(_code)));
$$;
REVOKE EXECUTE ON FUNCTION public.referral_code_valid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_code_valid(text) TO anon, authenticated;

-- Aplicar código depois (ex.: cadastro com Google), só se ainda não tiver indicação nem corridas
CREATE OR REPLACE FUNCTION public.apply_referral_code(_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _referrer uuid; _c text := upper(trim(_code));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar'; END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = _uid) THEN
    RAISE EXCEPTION 'Você já usou um código de indicação'; END IF;
  IF EXISTS (SELECT 1 FROM public.rides WHERE tutor_id = _uid OR driver_id = _uid) THEN
    RAISE EXCEPTION 'O código só pode ser aplicado antes da primeira corrida'; END IF;
  SELECT user_id INTO _referrer FROM public.referral_codes WHERE code = _c;
  IF _referrer IS NULL THEN RAISE EXCEPTION 'Código de indicação inválido'; END IF;
  IF _referrer = _uid THEN RAISE EXCEPTION 'Você não pode usar o seu próprio código'; END IF;
  INSERT INTO public.referrals (referrer_id, referred_id, code) VALUES (_referrer, _uid, _c);
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;

-- Qualificação e recompensas
CREATE OR REPLACE FUNCTION public.process_referral_rewards() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ref record; _n int; _have int;
BEGIN
  IF NEW.status <> 'completed' OR NEW.paid_at IS NULL THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' AND OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;

  -- Trilha tutor
  UPDATE public.referrals SET tutor_qualified_at = now()
   WHERE referred_id = NEW.tutor_id AND tutor_qualified_at IS NULL
  RETURNING * INTO _ref;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext('ref-tutor-' || _ref.referrer_id::text));
    SELECT count(*) INTO _n FROM public.referrals WHERE referrer_id = _ref.referrer_id AND tutor_qualified_at IS NOT NULL;
    SELECT count(*) INTO _have FROM public.referral_coupons WHERE owner_id = _ref.referrer_id;
    WHILE _have < _n / 5 LOOP
      INSERT INTO public.referral_coupons (owner_id, code) VALUES (_ref.referrer_id, public.generate_referral_code());
      _have := _have + 1;
    END LOOP;
  END IF;

  -- Trilha motorista (indicador e indicado são motoristas)
  IF NEW.driver_id IS NOT NULL THEN
    UPDATE public.referrals r SET driver_qualified_at = now()
     WHERE r.referred_id = NEW.driver_id AND r.driver_qualified_at IS NULL
       AND public.is_driver(r.referrer_id)
    RETURNING * INTO _ref;
    IF FOUND THEN
      PERFORM pg_advisory_xact_lock(hashtext('ref-driver-' || _ref.referrer_id::text));
      SELECT count(*) INTO _n FROM public.referrals WHERE referrer_id = _ref.referrer_id AND driver_qualified_at IS NOT NULL;
      SELECT count(*) INTO _have FROM public.driver_referral_bonuses WHERE driver_id = _ref.referrer_id;
      WHILE _have < _n / 5 LOOP
        INSERT INTO public.driver_referral_bonuses (driver_id) VALUES (_ref.referrer_id);
        _have := _have + 1;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.process_referral_rewards() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rides_referral_rewards AFTER UPDATE OF status, paid_at ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.process_referral_rewards();