-- 1) eta_traffic_calibration: leitura direta só para admin; app usa função segura
DROP POLICY IF EXISTS eta_calibration_select ON public.eta_traffic_calibration;
CREATE POLICY eta_calibration_admin_select ON public.eta_traffic_calibration
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.eta_avg_speed(_weekday smallint, _hour smallint)
RETURNS TABLE(avg_speed_kmh numeric, samples integer, source text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT c.avg_speed_kmh, c.samples, c.source, c.updated_at
  FROM public.eta_traffic_calibration c
  WHERE c.weekday = _weekday AND c.hour = _hour;
$$;

-- 2) ride_reviews: leitura apenas pelos envolvidos ou admin
DROP POLICY IF EXISTS reviews_select_authenticated ON public.ride_reviews;
CREATE POLICY reviews_select_participants ON public.ride_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR reviewee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- 3) pet-photos: leitura apenas pelo dono da pasta ou admin
DROP POLICY IF EXISTS pet_photos_read_authenticated ON storage.objects;
CREATE POLICY pet_photos_read_own_or_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pet-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );