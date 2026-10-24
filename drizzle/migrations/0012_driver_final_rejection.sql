ALTER TABLE public.drivers ADD COLUMN rejection_final boolean NOT NULL DEFAULT false;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_final_rejection_status CHECK (NOT rejection_final OR status = 'rejeitado');

CREATE FUNCTION public.guard_driver_final_rejection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rejection_final THEN RAISE EXCEPTION 'A recusa definitiva só pode ser registrada pela revisão administrativa'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.rejection_final THEN
    RAISE EXCEPTION 'Cadastro recusado em definitivo: não é possível alterar ou reenviar';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.rejection_final IS DISTINCT FROM OLD.rejection_final AND (
    coalesce(current_setting('gopet.final_driver_review', true), '') <> 'on'
    OR auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')
  ) THEN RAISE EXCEPTION 'A recusa definitiva só pode ser registrada pela revisão administrativa'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER drivers_guard_final_rejection BEFORE INSERT OR UPDATE OR DELETE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.guard_driver_final_rejection();

CREATE FUNCTION public.review_driver_application_decision(_driver_id uuid, _status public.driver_status, _reason text DEFAULT NULL, _final boolean DEFAULT false) RETURNS public.drivers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d public.drivers;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem revisar cadastros de motoristas'; END IF;
  SELECT * INTO d FROM public.drivers WHERE id = _driver_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Cadastro de motorista não encontrado'; END IF;
  IF d.rejection_final THEN RAISE EXCEPTION 'Este cadastro já foi recusado em definitivo'; END IF;
  IF (_status IN ('rejeitado','suspenso') AND length(coalesce(btrim(_reason),'')) < 5) OR (_final AND _status <> 'rejeitado') THEN RAISE EXCEPTION 'Informe o motivo da decisão (mínimo 5 caracteres)'; END IF;
  d := public.review_driver_application(_driver_id, _status, _reason);
  IF _final THEN
    PERFORM set_config('gopet.final_driver_review','on',true);
    UPDATE public.drivers SET rejection_final = true WHERE id = _driver_id RETURNING * INTO d;
    PERFORM set_config('gopet.final_driver_review','off',true);
  END IF;
  RAISE LOG '[driver-application-reviewed] admin_id=% driver_id=% status=% final=%', auth.uid(), _driver_id, _status, _final;
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.review_driver_application_decision(uuid,public.driver_status,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_driver_application_decision(uuid,public.driver_status,text,boolean) TO authenticated;

CREATE POLICY driver_documents_final_insert ON public.driver_documents AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final));
CREATE POLICY driver_documents_final_update ON public.driver_documents AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final)) WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final));
CREATE POLICY driver_documents_final_delete ON public.driver_documents AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final));
CREATE POLICY vehicles_final_insert ON public.vehicles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final));
CREATE POLICY vehicles_final_update ON public.vehicles AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final)) WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final));
CREATE POLICY vehicles_final_delete ON public.vehicles AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND NOT d.rejection_final));