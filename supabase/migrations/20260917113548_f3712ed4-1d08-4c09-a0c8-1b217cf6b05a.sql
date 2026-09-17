DROP FUNCTION IF EXISTS public.ride_counterpart_contact(uuid);

CREATE OR REPLACE FUNCTION public.ride_counterpart_contact(_ride_id uuid)
RETURNS TABLE(
  full_name text,
  phone text,
  avatar_url text,
  vehicle_plate text,
  vehicle_model text,
  vehicle_brand text,
  vehicle_color text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT id, tutor_id, driver_id INTO r FROM public.rides WHERE id = _ride_id;
  IF r.id IS NULL OR NOT public.is_ride_participant(_ride_id, auth.uid()) THEN
    RETURN;
  END IF;

  IF auth.uid() = r.tutor_id AND r.driver_id IS NOT NULL THEN
    -- Tutor vê dados públicos do motorista: nome, foto e veículo (sem telefone)
    RETURN QUERY
    SELECT p.full_name, NULL::text, p.avatar_url, v.plate, v.model, v.brand, v.color
    FROM public.profiles p
    LEFT JOIN public.drivers d ON d.user_id = p.id
    LEFT JOIN public.vehicles v ON v.driver_id = d.id
    WHERE p.id = r.driver_id
    LIMIT 1;
  ELSIF auth.uid() = r.driver_id THEN
    -- Motorista vê apenas o nome do tutor (sem telefone/CPF)
    RETURN QUERY
    SELECT p.full_name, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
    FROM public.profiles p
    WHERE p.id = r.tutor_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ride_counterpart_contact(uuid) TO authenticated;