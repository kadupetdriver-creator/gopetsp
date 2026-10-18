CREATE OR REPLACE FUNCTION public.pay_ride_with_gopet_balance(_ride_id uuid, _user_id uuid, _coupon_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    amount := greatest(1, round(r.price_cents::numeric * (100 - c.discount_percent) / 100)::integer);
  END IF;
  IF amount <= 0 THEN RETURN jsonb_build_object('error', 'Valor da corrida inválido.'); END IF;
  SELECT coalesce(sum(CASE WHEN kind = 'spend' THEN -amount_cents ELSE amount_cents END), 0) INTO balance FROM public.credit_transactions WHERE user_id = _user_id AND status = 'completed';
  IF balance < amount THEN RETURN jsonb_build_object('error', 'Saldo insuficiente para pagar esta corrida.', 'balanceCents', balance); END IF;
  INSERT INTO public.credit_transactions(user_id, kind, amount_cents, status, payment_method, description, ride_id, completed_at)
  VALUES (_user_id, 'spend', amount, 'completed', 'credits', 'Pagamento de corrida com saldo GoPet', r.id, now());
  UPDATE public.rides SET paid_at = now() WHERE id = r.id;
  IF _coupon_id IS NOT NULL THEN UPDATE public.referral_coupons SET status = 'used', used_ride_id = r.id, used_at = now() WHERE id = c.id; END IF;
  RETURN jsonb_build_object('status', 'paid', 'balanceCents', balance - amount);
END; $$;
REVOKE ALL ON FUNCTION public.pay_ride_with_gopet_balance(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_ride_with_gopet_balance(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_mp_against_balance_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE paid timestamptz;
BEGIN
  SELECT paid_at INTO paid FROM public.rides WHERE id = NEW.ride_id FOR UPDATE;
  IF paid IS NOT NULL THEN RAISE EXCEPTION 'Esta corrida já foi paga.'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER mp_payment_balance_guard BEFORE INSERT ON public.mercadopago_payments FOR EACH ROW EXECUTE FUNCTION public.guard_mp_against_balance_payment();

CREATE OR REPLACE FUNCTION public.refund_ride_gopet_balance(_ride_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rides; debit public.credit_transactions;
BEGIN
  SELECT * INTO r FROM public.rides WHERE id = _ride_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'cancelled' THEN RETURN jsonb_build_object('error', 'A corrida não está cancelada.'); END IF;
  SELECT * INTO debit FROM public.credit_transactions WHERE ride_id = r.id AND kind = 'spend' AND payment_method = 'credits' AND status = 'completed';
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'none'); END IF;
  INSERT INTO public.credit_transactions(user_id, kind, amount_cents, status, payment_method, description, ride_id, completed_at)
  VALUES (debit.user_id, 'refund', debit.amount_cents, 'completed', 'credits', 'Reembolso de corrida no saldo GoPet', r.id, now()) ON CONFLICT (ride_id, kind) WHERE ride_id IS NOT NULL DO NOTHING;
  UPDATE public.rides SET paid_at = NULL WHERE id = r.id AND paid_at IS NOT NULL;
  RETURN jsonb_build_object('status', 'refunded');
END; $$;
REVOKE ALL ON FUNCTION public.refund_ride_gopet_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ride_gopet_balance(uuid) TO service_role;