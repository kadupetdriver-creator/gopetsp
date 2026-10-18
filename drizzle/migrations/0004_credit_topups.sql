CREATE TABLE public.mercadopago_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mp_order_id text UNIQUE,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  status_detail text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  qr_code text,
  qr_code_base64 text,
  expires_at timestamptz,
  credit_tx_id uuid REFERENCES public.credit_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mercadopago_topups_user_idx ON public.mercadopago_topups (user_id, created_at DESC);
GRANT SELECT ON public.mercadopago_topups TO authenticated;
GRANT ALL ON public.mercadopago_topups TO service_role;
ALTER TABLE public.mercadopago_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY topups_select_own ON public.mercadopago_topups FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY topups_select_admin ON public.mercadopago_topups FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER mercadopago_topups_updated_at BEFORE UPDATE ON public.mercadopago_topups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.mercadopago_topups;

CREATE OR REPLACE FUNCTION public.apply_mercadopago_topup(_topup_id uuid, _status text, _status_detail text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.mercadopago_topups; tx uuid;
BEGIN
  SELECT * INTO t FROM public.mercadopago_topups WHERE id = _topup_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  UPDATE public.mercadopago_topups SET status = _status, status_detail = _status_detail WHERE id = t.id;
  IF _status = 'approved' AND t.credit_tx_id IS NULL THEN
    INSERT INTO public.credit_transactions(user_id, kind, amount_cents, status, payment_method, description, completed_at)
    VALUES (t.user_id, 'topup', t.amount_cents, 'completed', t.payment_method, 'Recarga de saldo GoPet', now()) RETURNING id INTO tx;
    UPDATE public.mercadopago_topups SET credit_tx_id = tx WHERE id = t.id;
  ELSIF _status IN ('refunded','cancelled') AND t.credit_tx_id IS NOT NULL THEN
    UPDATE public.credit_transactions SET status = 'cancelled' WHERE id = t.credit_tx_id AND status = 'completed';
  END IF;
  RETURN jsonb_build_object('status', _status);
END; $$;
REVOKE ALL ON FUNCTION public.apply_mercadopago_topup(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mercadopago_topup(uuid, text, text) TO service_role;