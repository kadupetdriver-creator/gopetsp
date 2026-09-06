DROP FUNCTION IF EXISTS public.credit_balance_cents(uuid);

CREATE OR REPLACE FUNCTION public.my_credit_balance_cents()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN kind = 'spend' THEN -amount_cents ELSE amount_cents END
  ), 0)::int
  FROM public.credit_transactions
  WHERE user_id = auth.uid() AND status = 'completed';
$$;

GRANT EXECUTE ON FUNCTION public.my_credit_balance_cents() TO authenticated;