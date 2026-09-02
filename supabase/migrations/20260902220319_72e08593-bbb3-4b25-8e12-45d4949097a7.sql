CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_view_profile(_viewer_id UUID, _profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    _viewer_id = _profile_id
    OR EXISTS (
      SELECT 1
      FROM public.rides AS r
      WHERE
        (r.tutor_id = _viewer_id AND r.driver_id = _profile_id)
        OR (r.driver_id = _viewer_id AND r.tutor_id = _profile_id)
    );
$$;

REVOKE ALL ON FUNCTION private.can_view_profile(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_profile(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_select_self_or_ride_participant" ON public.profiles;

CREATE POLICY "profiles_select_self_or_ride_participant"
ON public.profiles
FOR SELECT
TO authenticated
USING (private.can_view_profile(auth.uid(), id));

DROP FUNCTION public.can_view_profile(UUID, UUID);