ALTER TABLE public.ride_cancellations
  ADD COLUMN IF NOT EXISTS refund_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS refund_method text,
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer,
  ADD COLUMN IF NOT EXISTS retained_amount_cents integer,
  ADD COLUMN IF NOT EXISTS refund_mp_order_id text,
  ADD COLUMN IF NOT EXISTS refund_transaction_id text,
  ADD COLUMN IF NOT EXISTS refund_error text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE OR REPLACE FUNCTION public.refund_ride_gopet_balance_amount(_ride_id uuid, _amount_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rides; debit public.credit_transactions; amt integer;
BEGIN
  SELECT * INTO r FROM public.rides WHERE id = _ride_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'cancelled' THEN RETURN jsonb_build_object('error', 'A corrida não está cancelada.'); END IF;
  SELECT * INTO debit FROM public.credit_transactions WHERE ride_id = r.id AND kind = 'spend' AND payment_method = 'credits' AND status = 'completed';
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'none'); END IF;
  amt := least(greatest(coalesce(_amount_cents, 0), 0), debit.amount_cents);
  IF amt > 0 THEN
    INSERT INTO public.credit_transactions(user_id, kind, amount_cents, status, payment_method, description, ride_id, completed_at)
    VALUES (debit.user_id, 'refund', amt, 'completed', 'credits', 'Reembolso de cancelamento no saldo GoPet', r.id, now())
    ON CONFLICT (ride_id, kind) WHERE ride_id IS NOT NULL DO NOTHING;
  END IF;
  UPDATE public.rides SET paid_at = NULL WHERE id = r.id AND paid_at IS NOT NULL;
  RETURN jsonb_build_object('status', 'refunded', 'amountCents', amt, 'paidCents', debit.amount_cents);
END $$;

REVOKE ALL ON FUNCTION public.refund_ride_gopet_balance_amount(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ride_gopet_balance_amount(uuid, integer) TO service_role;