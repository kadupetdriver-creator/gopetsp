CREATE OR REPLACE FUNCTION private.list_preferred_drivers()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_path text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.user_id,
         d.full_name,
         d.avatar_path,
         v.brand,
         v.model,
         v.color
    FROM public.drivers d
    JOIN public.profiles p ON p.id = d.user_id
    LEFT JOIN public.vehicles v ON v.driver_id = d.id
   WHERE auth.uid() IS NOT NULL
     AND d.status = 'aprovado'::public.driver_status
     AND p.is_active = true
   ORDER BY d.full_name;
$$;
REVOKE ALL ON FUNCTION private.list_preferred_drivers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_preferred_drivers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_preferred_drivers()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_path text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT * FROM private.list_preferred_drivers();
$$;
REVOKE ALL ON FUNCTION public.list_preferred_drivers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_preferred_drivers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_ride_preference_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL AND NEW.preferred_driver_id IS NOT NULL THEN
    NEW.preferred_until := now() + interval '10 minutes';
  ELSIF NEW.preferred_driver_id IS NULL OR NEW.paid_at IS NULL THEN
    NEW.preferred_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_ride_preference_window() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ride_preference_window() TO service_role;

DROP TRIGGER IF EXISTS rides_set_preference_window ON public.rides;
CREATE TRIGGER rides_set_preference_window
BEFORE UPDATE OF paid_at, preferred_driver_id ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.set_ride_preference_window();