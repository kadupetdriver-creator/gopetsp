ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_requested_at timestamptz;
-- Preserve rides created under the previous automatic-dispatch flow.
UPDATE public.rides SET driver_requested_at = created_at WHERE driver_requested_at IS NULL;
COMMENT ON COLUMN public.rides.driver_requested_at IS 'Tutor explicitly requested a driver after confirmed payment; legacy rides retain their original dispatch.';

CREATE POLICY rides_request_visibility ON public.rides AS RESTRICTIVE FOR SELECT TO authenticated
USING (tutor_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR driver_id = auth.uid() OR (paid_at IS NOT NULL AND driver_requested_at IS NOT NULL));
CREATE POLICY rides_request_updates ON public.rides AS RESTRICTIVE FOR UPDATE TO authenticated
USING (tutor_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR driver_id = auth.uid() OR (paid_at IS NOT NULL AND driver_requested_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.guard_ride_driver_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.driver_requested_at IS DISTINCT FROM OLD.driver_requested_at AND auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'A chamada do motorista deve ser confirmada pelo aplicativo';
  END IF;
  IF (NEW.driver_id IS DISTINCT FROM OLD.driver_id AND NEW.driver_id IS NOT NULL) OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted','en_route','in_progress')) THEN
    IF NEW.paid_at IS NULL OR NEW.driver_requested_at IS NULL THEN
      RAISE EXCEPTION 'Confirme o pagamento e toque em Chamar motorista antes de efetivar a corrida';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_ride_driver_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_ride_driver_request() TO service_role;
CREATE TRIGGER rides_guard_driver_request BEFORE UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.guard_ride_driver_request();

CREATE OR REPLACE FUNCTION public.set_ride_preference_window() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.preferred_driver_id IS NULL OR NEW.paid_at IS NULL OR NEW.driver_requested_at IS NULL THEN
    NEW.preferred_until := NULL;
  ELSIF OLD.driver_requested_at IS NULL AND NEW.driver_requested_at IS NOT NULL THEN
    NEW.preferred_until := now() + interval '10 minutes';
  ELSIF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL THEN
    NEW.preferred_until := now() + interval '10 minutes';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rides_set_preference_window ON public.rides;
CREATE TRIGGER rides_set_preference_window BEFORE UPDATE OF paid_at, preferred_driver_id, driver_requested_at ON public.rides FOR EACH ROW EXECUTE FUNCTION public.set_ride_preference_window();

CREATE OR REPLACE FUNCTION public.request_paid_ride_driver(_ride_id uuid, _tutor_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.rides; requested timestamptz;
BEGIN
  SELECT * INTO r FROM public.rides WHERE id = _ride_id FOR UPDATE;
  IF r.id IS NULL OR r.tutor_id <> _tutor_id THEN RAISE EXCEPTION 'Corrida não encontrada'; END IF;
  IF r.paid_at IS NULL THEN RAISE EXCEPTION 'Aguarde a confirmação do pagamento'; END IF;
  IF r.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Esta corrida já foi encerrada'; END IF;
  IF r.driver_requested_at IS NOT NULL THEN RETURN r.driver_requested_at; END IF;
  IF r.status <> 'pending' OR r.driver_id IS NOT NULL THEN RAISE EXCEPTION 'Esta corrida não pode ser enviada'; END IF;
  UPDATE public.rides SET driver_requested_at = now() WHERE id = r.id RETURNING driver_requested_at INTO requested;
  RETURN requested;
END; $$;
REVOKE ALL ON FUNCTION public.request_paid_ride_driver(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_paid_ride_driver(uuid, uuid) TO service_role;