CREATE INDEX IF NOT EXISTS ride_reviews_reviewee_recent_idx ON public.ride_reviews (reviewee_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.recent_rating_average(_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT round(avg(recent.rating), 2) FROM (
   SELECT v.rating FROM public.ride_reviews v WHERE v.reviewee_id = _user_id
   ORDER BY v.created_at DESC, v.id DESC LIMIT 100
 ) recent;
$$;
REVOKE ALL ON FUNCTION public.recent_rating_average(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_rating_summary()
RETURNS TABLE(average_rating numeric, rating_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT public.recent_rating_average(auth.uid()), count(*) FROM public.ride_reviews WHERE reviewee_id = auth.uid() AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.my_rating_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_rating_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.pending_ride_reviews()
RETURNS TABLE(ride_id uuid, reviewee_id uuid, reviewer_role text, reviewee_name text, average_rating numeric, rating_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT r.id, CASE WHEN r.tutor_id = auth.uid() THEN r.driver_id ELSE r.tutor_id END,
 CASE WHEN r.tutor_id = auth.uid() THEN 'tutor' ELSE 'driver' END,
 p.full_name, public.recent_rating_average(p.id),
 (SELECT count(*) FROM public.ride_reviews v WHERE v.reviewee_id = p.id)
 FROM public.rides r JOIN public.profiles p ON p.id = CASE WHEN r.tutor_id = auth.uid() THEN r.driver_id ELSE r.tutor_id END
 WHERE auth.uid() IS NOT NULL AND r.status = 'completed' AND r.driver_id IS NOT NULL
 AND (r.tutor_id = auth.uid() OR r.driver_id = auth.uid())
 AND NOT EXISTS (SELECT 1 FROM public.ride_reviews own WHERE own.ride_id = r.id AND own.reviewer_id = auth.uid())
 ORDER BY r.updated_at DESC, r.id;
$$;
REVOKE ALL ON FUNCTION public.pending_ride_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_ride_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_rating_summaries()
RETURNS TABLE(user_id uuid, full_name text, role app_role, avatar_path text, average_rating numeric, rating_count bigint, low_rating_count bigint, last_review_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
   RAISE EXCEPTION 'Acesso restrito à administração.' USING ERRCODE = '42501';
 END IF;
 RETURN QUERY
 WITH ranked AS (
   SELECT v.reviewee_id AS rid, v.rating AS rt, v.created_at AS ca,
     row_number() OVER (PARTITION BY v.reviewee_id ORDER BY v.created_at DESC, v.id DESC) AS rn
   FROM public.ride_reviews v
 ), agg AS (
   SELECT rid, round(avg(rt) FILTER (WHERE rn <= 100), 2) AS avg_recent, count(*) AS total,
     count(*) FILTER (WHERE rt <= 2) AS low, max(ca) AS last_at
   FROM ranked GROUP BY rid
 )
 SELECT p.id, p.full_name, p.role, coalesce(nullif(p.avatar_url, ''), d.avatar_path),
   a.avg_recent, coalesce(a.total, 0)::bigint, coalesce(a.low, 0)::bigint, a.last_at
 FROM public.profiles p
 LEFT JOIN agg a ON a.rid = p.id
 LEFT JOIN public.drivers d ON d.user_id = p.id
 ORDER BY p.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_rating_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rating_summaries() TO authenticated;