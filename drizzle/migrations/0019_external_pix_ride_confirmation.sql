CREATE TABLE public.external_ride_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ride_id uuid NOT NULL UNIQUE REFERENCES public.rides(id),
 confirmed_by uuid NOT NULL REFERENCES public.profiles(id),
 amount_cents integer NOT NULL CHECK (amount_cents > 0),
 payment_method text NOT NULL DEFAULT 'pix_external' CHECK (payment_method = 'pix_external'),
 note text NOT NULL CHECK (length(btrim(note)) BETWEEN 5 AND 500),
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.external_ride_payments TO authenticated;
GRANT ALL ON public.external_ride_payments TO service_role;
ALTER TABLE public.external_ride_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_external_payments ON public.external_ride_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.confirm_external_ride_payment(_ride_id uuid, _admin_id uuid, _expected_updated_at timestamptz, _note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rides; receipt public.external_ride_payments; payment_time timestamptz := now();
BEGIN
 IF NOT public.has_role(_admin_id, 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem confirmar pagamentos.'; END IF;
 IF _note IS NULL OR length(btrim(_note)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Informe uma observação de 5 a 500 caracteres.'; END IF;
 SELECT * INTO r FROM public.rides WHERE id = _ride_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Corrida não encontrada.'; END IF;
 SELECT * INTO receipt FROM public.external_ride_payments WHERE ride_id = r.id;
 IF FOUND AND r.paid_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'alreadyPaid', true); END IF;
 IF r.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Esta corrida já foi paga.'; END IF;
 IF r.status <> 'pending' THEN RAISE EXCEPTION 'Somente orçamentos pendentes podem receber pagamento externo.'; END IF;
 IF r.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'O orçamento mudou. Atualize e tente novamente.'; END IF;
 IF r.price_cents <= 0 THEN RAISE EXCEPTION 'Valor da corrida inválido.'; END IF;
 IF EXISTS (SELECT 1 FROM public.mercadopago_payments WHERE ride_id = r.id AND status IN ('pending','in_process','approved')) THEN RAISE EXCEPTION 'Existe um pagamento pela plataforma pendente ou aprovado. Verifique antes de confirmar o Pix externo.'; END IF;
 IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE ride_id = r.id AND kind = 'spend' AND status = 'completed') THEN RAISE EXCEPTION 'Existe um pagamento com saldo para esta corrida.'; END IF;
 INSERT INTO public.external_ride_payments(ride_id, confirmed_by, amount_cents, note, confirmed_at) VALUES (r.id, _admin_id, r.price_cents, btrim(_note), payment_time);
 UPDATE public.rides SET paid_at = payment_time WHERE id = r.id;
 RETURN jsonb_build_object('ok', true, 'alreadyPaid', false);
END; $$;
REVOKE ALL ON FUNCTION public.confirm_external_ride_payment(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_external_ride_payment(uuid, uuid, timestamptz, text) TO service_role;