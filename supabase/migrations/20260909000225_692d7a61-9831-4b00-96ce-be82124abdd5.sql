CREATE OR REPLACE FUNCTION public.guard_ride_payments_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ride_driver uuid;
BEGIN
  IF NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'pending'  AND NEW.status IN ('held','failed','cancelled')) OR
      (OLD.status = 'held'     AND NEW.status IN ('released','refunded')) OR
      (OLD.status IN ('failed','cancelled') AND NEW.status IN ('pending','held'))
    ) THEN
      RAISE EXCEPTION 'Transição de pagamento inválida: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF OLD.status NOT IN ('pending','failed','cancelled') THEN
    IF NEW.amount_cents <> OLD.amount_cents
       OR NEW.platform_fee_cents <> OLD.platform_fee_cents
       OR NEW.driver_amount_cents <> OLD.driver_amount_cents
       OR NEW.ride_id <> OLD.ride_id
       OR NEW.tutor_id <> OLD.tutor_id THEN
      RAISE EXCEPTION 'Valores do pagamento não podem ser alterados após a cobrança';
    END IF;
  END IF;

  IF OLD.stripe_transfer_id IS NOT NULL
     AND NEW.stripe_transfer_id IS DISTINCT FROM OLD.stripe_transfer_id THEN
    RAISE EXCEPTION 'Transferência já registrada para este pagamento';
  END IF;

  IF NEW.status = 'released' THEN
    IF NEW.driver_id IS NULL THEN
      RAISE EXCEPTION 'Não é possível liberar pagamento sem motorista';
    END IF;
    SELECT r.driver_id INTO ride_driver FROM public.rides r WHERE r.id = NEW.ride_id;
    IF ride_driver IS NULL OR ride_driver <> NEW.driver_id THEN
      RAISE EXCEPTION 'Motorista não pertence a esta corrida';
    END IF;
    IF NEW.payment_method = 'credits' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.credit_transactions ct
        WHERE ct.ride_id = NEW.ride_id AND ct.kind = 'payout' AND ct.status = 'completed'
      ) THEN
        RAISE EXCEPTION 'Repasse em créditos ainda não realizado';
      END IF;
    ELSIF NEW.stripe_transfer_id IS NULL THEN
      RAISE EXCEPTION 'Repasse ao motorista ainda não realizado';
    END IF;
    IF NEW.released_at IS NULL THEN
      NEW.released_at := now();
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ride_payments_update() FROM public, anon, authenticated;
