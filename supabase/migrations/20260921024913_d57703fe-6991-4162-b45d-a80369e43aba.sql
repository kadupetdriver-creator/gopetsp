DROP POLICY IF EXISTS reviews_select_participants ON public.ride_reviews;

CREATE POLICY reviews_select_double_blind
ON public.ride_reviews
FOR SELECT
TO authenticated
USING (
  reviewer_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (
    reviewee_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.ride_reviews own_review
      WHERE own_review.ride_id = ride_reviews.ride_id
        AND own_review.reviewer_id = auth.uid()
    )
  )
);