CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer_id UUID, _profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.can_view_profile(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "profiles_select_self_or_ride_participant"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_view_profile(auth.uid(), id));