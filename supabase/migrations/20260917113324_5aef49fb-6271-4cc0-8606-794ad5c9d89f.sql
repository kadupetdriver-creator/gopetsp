CREATE OR REPLACE FUNCTION public.ride_counterpart_contact(_ride_id UUID)
RETURNS TABLE(full_name TEXT, phone TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rides%ROWTYPE;
  viewer UUID := auth.uid();
BEGIN
  IF viewer IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO r FROM public.rides WHERE id = _ride_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF viewer = r.tutor_id AND r.driver_id IS NOT NULL THEN
    -- Tutor vê apenas o nome do motorista, sem telefone
    RETURN QUERY
      SELECT p.full_name, NULL::TEXT FROM public.profiles p WHERE p.id = r.driver_id;
  ELSIF viewer = r.driver_id THEN
    -- Motorista vê apenas o primeiro nome do tutor, sem telefone nem CPF
    RETURN QUERY
      SELECT split_part(btrim(p.full_name), ' ', 1), NULL::TEXT
      FROM public.profiles p WHERE p.id = r.tutor_id;
  END IF;
END;
$$;