CREATE OR REPLACE FUNCTION public.guard_driver_final_rejection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rejection_final THEN RAISE EXCEPTION 'A recusa definitiva só pode ser registrada pela revisão administrativa'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND (auth.role() = 'service_role' OR auth.uid() IS NULL) THEN RETURN OLD; END IF;
  IF OLD.rejection_final THEN RAISE EXCEPTION 'Cadastro recusado em definitivo: não é possível alterar ou reenviar'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.rejection_final IS DISTINCT FROM OLD.rejection_final AND (
    coalesce(current_setting('gopet.final_driver_review', true), '') <> 'on'
    OR auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')
  ) THEN RAISE EXCEPTION 'A recusa definitiva só pode ser registrada pela revisão administrativa'; END IF;
  RETURN NEW;
END;
$$;