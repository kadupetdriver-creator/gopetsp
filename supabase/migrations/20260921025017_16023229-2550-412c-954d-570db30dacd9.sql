ALTER TABLE public.ride_reviews
ADD COLUMN revealed_at timestamptz;

UPDATE public.ride_reviews review
SET revealed_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.ride_reviews counterpart
  WHERE counterpart.ride_id = review.ride_id
    AND counterpart.reviewer_id <> review.reviewer_id
);

CREATE OR REPLACE FUNCTION public.reveal_mutual_ride_reviews()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ride_reviews other_review
    WHERE other_review.ride_id = NEW.ride_id
      AND other_review.reviewer_id <> NEW.reviewer_id
  ) THEN
    UPDATE public.ride_reviews
    SET revealed_at = now()
    WHERE ride_id = NEW.ride_id
      AND revealed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_mutual_ride_reviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_mutual_ride_reviews() TO service_role;

CREATE TRIGGER reveal_mutual_ride_reviews_after_insert
AFTER INSERT ON public.ride_reviews
FOR EACH ROW
EXECUTE FUNCTION public.reveal_mutual_ride_reviews();

DROP POLICY IF EXISTS reviews_select_double_blind ON public.ride_reviews;

CREATE POLICY reviews_select_double_blind
ON public.ride_reviews
FOR SELECT
TO authenticated
USING (
  reviewer_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (reviewee_id = auth.uid() AND revealed_at IS NOT NULL)
);