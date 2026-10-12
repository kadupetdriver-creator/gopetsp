ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
UPDATE public.vehicles SET is_active = true;
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_driver_id_key;
CREATE INDEX IF NOT EXISTS vehicles_driver_id_idx ON public.vehicles(driver_id);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_one_active_per_driver ON public.vehicles(driver_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.vehicles_default_active()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE driver_id = NEW.driver_id AND is_active) THEN
    NEW.is_active := true;
  ELSE
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vehicles_default_active ON public.vehicles;
CREATE TRIGGER vehicles_default_active BEFORE INSERT ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.vehicles_default_active();

CREATE OR REPLACE FUNCTION public.set_active_vehicle(_vehicle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _driver uuid;
BEGIN
  SELECT v.driver_id INTO _driver FROM public.vehicles v JOIN public.drivers d ON d.id = v.driver_id
  WHERE v.id = _vehicle_id AND (d.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  IF _driver IS NULL THEN RAISE EXCEPTION 'Veículo não encontrado.'; END IF;
  UPDATE public.vehicles SET is_active = false WHERE driver_id = _driver AND is_active AND id <> _vehicle_id;
  UPDATE public.vehicles SET is_active = true WHERE id = _vehicle_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_active_vehicle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_vehicle(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.vehicles_promote_after_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_active THEN
    UPDATE public.vehicles SET is_active = true
    WHERE id = (SELECT id FROM public.vehicles WHERE driver_id = OLD.driver_id ORDER BY created_at LIMIT 1);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS vehicles_promote_after_delete ON public.vehicles;
CREATE TRIGGER vehicles_promote_after_delete AFTER DELETE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.vehicles_promote_after_delete();