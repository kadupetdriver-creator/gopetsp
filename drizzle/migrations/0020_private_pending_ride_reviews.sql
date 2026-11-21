DROP POLICY IF EXISTS reviews_select_double_blind ON public.ride_reviews;
CREATE POLICY reviews_select_private ON public.ride_reviews FOR SELECT TO authenticated USING (reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.pending_ride_reviews()
RETURNS TABLE(ride_id uuid, reviewee_id uuid, reviewer_role text, reviewee_name text, average_rating numeric, rating_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT r.id, CASE WHEN r.tutor_id = auth.uid() THEN r.driver_id ELSE r.tutor_id END,
 CASE WHEN r.tutor_id = auth.uid() THEN 'tutor' ELSE 'driver' END,
 p.full_name, (SELECT round(avg(v.rating), 2) FROM public.ride_reviews v WHERE v.reviewee_id = p.id),
 (SELECT count(*) FROM public.ride_reviews v WHERE v.reviewee_id = p.id)
 FROM public.rides r JOIN public.profiles p ON p.id = CASE WHEN r.tutor_id = auth.uid() THEN r.driver_id ELSE r.tutor_id END
 WHERE auth.uid() IS NOT NULL AND r.status = 'completed' AND r.driver_id IS NOT NULL
 AND (r.tutor_id = auth.uid() OR r.driver_id = auth.uid())
 AND NOT EXISTS (SELECT 1 FROM public.ride_reviews own WHERE own.ride_id = r.id AND own.reviewer_id = auth.uid())
 ORDER BY r.updated_at DESC, r.id;
$$;
REVOKE ALL ON FUNCTION public.pending_ride_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_ride_reviews() TO authenticated;
CREATE OR REPLACE FUNCTION public.my_rating_summary()
RETURNS TABLE(average_rating numeric, rating_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT round(avg(rating),2), count(*) FROM public.ride_reviews WHERE reviewee_id = auth.uid() AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.my_rating_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_rating_summary() TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_reviews;