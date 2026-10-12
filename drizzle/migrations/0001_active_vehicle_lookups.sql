CREATE OR REPLACE FUNCTION private.list_preferred_drivers()
 RETURNS TABLE(user_id uuid, full_name text, avatar_path text, vehicle_brand text, vehicle_model text, vehicle_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT d.user_id, d.full_name, d.avatar_path, v.brand, v.model, v.color
    FROM public.drivers d
    JOIN public.profiles p ON p.id = d.user_id
    LEFT JOIN public.vehicles v ON v.driver_id = d.id AND v.is_active
   WHERE auth.uid() IS NOT NULL
     AND d.status = 'aprovado'::public.driver_status
     AND p.is_active = true
   ORDER BY d.full_name;
$function$;

CREATE OR REPLACE FUNCTION public.ride_counterpart_contact(_ride_id uuid)
 RETURNS TABLE(full_name text, phone text, avatar_path text, vehicle_plate text, vehicle_model text, vehicle_brand text, vehicle_color text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  SELECT id, tutor_id, driver_id INTO r FROM public.rides WHERE id = _ride_id;
  IF r.id IS NULL OR NOT public.is_ride_participant(_ride_id, auth.uid()) THEN
    RETURN;
  END IF;
  IF auth.uid() = r.tutor_id AND r.driver_id IS NOT NULL THEN
    RETURN QUERY
    SELECT p.full_name, NULL::text, d.avatar_path, v.plate, v.model, v.brand, v.color
    FROM public.profiles p
    LEFT JOIN public.drivers d ON d.user_id = p.id
    LEFT JOIN public.vehicles v ON v.driver_id = d.id AND v.is_active
    WHERE p.id = r.driver_id
    LIMIT 1;
  ELSIF auth.uid() = r.driver_id THEN
    RETURN QUERY
    SELECT p.full_name, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
    FROM public.profiles p
    WHERE p.id = r.tutor_id;
  END IF;
END;
$function$;