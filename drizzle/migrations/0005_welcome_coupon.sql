ALTER TABLE public.referral_coupons ADD COLUMN discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.referral_coupons ADD COLUMN coupon_kind text NOT NULL DEFAULT 'referral';
CREATE UNIQUE INDEX referral_coupons_one_welcome_per_owner ON public.referral_coupons(owner_id) WHERE coupon_kind = 'welcome';

CREATE OR REPLACE FUNCTION public.coupon_amount_cents(_price integer, _percent integer, _cents integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT greatest(1, round(_price::numeric * (100 - coalesce(_percent,0)) / 100)::integer - coalesce(_cents,0));
$$;

CREATE OR REPLACE FUNCTION public.issue_welcome_coupon(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; i int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.referral_coupons WHERE owner_id = _user_id AND coupon_kind = 'welcome') THEN RETURN; END IF;
  LOOP
    _code := 'BEMVINDO-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_coupons WHERE code = _code);
    i := i + 1; IF i > 20 THEN RAISE EXCEPTION 'Não foi possível gerar o cupom'; END IF;
  END LOOP;
  INSERT INTO public.referral_coupons(owner_id, code, discount_percent, discount_cents, coupon_kind, status)
  VALUES (_user_id, _code, 0, 500, 'welcome', 'available') ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.issue_welcome_coupon(uuid) FROM public, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.pay_ride_with_gopet_balance(_ride_id uuid, _user_id uuid, _coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.rides; c public.referral_coupons; balance bigint; amount integer;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Conta não encontrada.'); END IF;
  SELECT * INTO r FROM public.rides WHERE id = _ride_id FOR UPDATE;
  IF NOT FOUND OR r.tutor_id <> _user_id THEN RETURN jsonb_build_object('error', 'Corrida não encontrada.'); END IF;
  IF r.paid_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'paid'); END IF;
  IF r.status IN ('completed', 'cancelled') THEN RETURN jsonb_build_object('error', 'Esta corrida não está disponível para pagamento.'); END IF;
  IF EXISTS (SELECT 1 FROM public.mercadopago_payments WHERE ride_id = r.id AND status IN ('pending','in_process','approved')) THEN
    RETURN jsonb_build_object('error', 'Há um pagamento pelo Mercado Pago aguardando confirmação. Aguarde antes de usar o saldo.');
  END IF;
  amount := r.price_cents;
  IF _coupon_id IS NOT NULL THEN
    SELECT * INTO c FROM public.referral_coupons WHERE id = _coupon_id FOR UPDATE;
    IF NOT FOUND OR c.owner_id <> _user_id OR c.status <> 'available' THEN RETURN jsonb_build_object('error', 'Este cupom não está mais disponível.'); END IF;
    IF c.coupon_kind = 'welcome' AND EXISTS (SELECT 1 FROM public.rides WHERE tutor_id = _user_id AND paid_at IS NOT NULL) THEN
      RETURN jsonb_build_object('error', 'O cupom de boas-vindas vale apenas para a primeira corrida.');
    END IF;
    amount := public.coupon_amount_cents(r.price_cents, c.discount_percent, c.discount_cents);
  END IF;
  IF amount <= 0 THEN RETURN jsonb_build_object('error', 'Valor da corrida inválido.'); END IF;
  SELECT coalesce(sum(CASE WHEN kind = 'spend' THEN -amount_cents ELSE amount_cents END), 0) INTO balance FROM public.credit_transactions WHERE user_id = _user_id AND status = 'completed';
  IF balance < amount THEN RETURN jsonb_build_object('error', 'Saldo insuficiente para pagar esta corrida.', 'balanceCents', balance); END IF;
  INSERT INTO public.credit_transactions(user_id, kind, amount_cents, status, payment_method, description, ride_id, completed_at)
  VALUES (_user_id, 'spend', amount, 'completed', 'credits', 'Pagamento de corrida com saldo GoPet', r.id, now());
  UPDATE public.rides SET paid_at = now() WHERE id = r.id;
  IF _coupon_id IS NOT NULL THEN UPDATE public.referral_coupons SET status = 'used', used_ride_id = r.id, used_at = now() WHERE id = c.id; END IF;
  RETURN jsonb_build_object('status', 'paid', 'balanceCents', balance - amount);
END; $function$;