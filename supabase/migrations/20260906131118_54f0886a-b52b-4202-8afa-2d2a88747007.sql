CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'topup',
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  description text,
  environment text NOT NULL DEFAULT 'sandbox',
  stripe_session_id text UNIQUE,
  stripe_payment_intent text,
  ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_transactions_user_idx ON public.credit_transactions (user_id, created_at DESC);

GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_transactions_select_own ON public.credit_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER credit_transactions_updated_at
  BEFORE UPDATE ON public.credit_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.credit_balance_cents(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN kind = 'spend' THEN -amount_cents ELSE amount_cents END
  ), 0)::int
  FROM public.credit_transactions
  WHERE user_id = _user_id AND status = 'completed';
$$;

GRANT EXECUTE ON FUNCTION public.credit_balance_cents(uuid) TO authenticated, service_role;