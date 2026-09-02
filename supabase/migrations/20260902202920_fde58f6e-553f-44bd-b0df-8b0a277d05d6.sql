ALTER TABLE public.pets
  ADD COLUMN photo_url TEXT,
  ADD COLUMN breed TEXT,
  ADD COLUMN temperament TEXT,
  ADD COLUMN weight_kg NUMERIC(5,2),
  ADD COLUMN health_notes TEXT,
  ADD COLUMN transport_items TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER pets_updated_at BEFORE UPDATE ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rides
  ADD COLUMN driver_lat DOUBLE PRECISION,
  ADD COLUMN driver_lng DOUBLE PRECISION,
  ADD COLUMN location_updated_at TIMESTAMPTZ,
  ADD COLUMN origin_lat DOUBLE PRECISION,
  ADD COLUMN origin_lng DOUBLE PRECISION,
  ADD COLUMN destination_lat DOUBLE PRECISION,
  ADD COLUMN destination_lng DOUBLE PRECISION,
  ADD COLUMN share_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');

CREATE UNIQUE INDEX rides_share_token_key ON public.rides (share_token);

CREATE OR REPLACE FUNCTION public.is_ride_participant(_ride_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.id = _ride_id AND (r.tutor_id = _user_id OR r.driver_id = _user_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_ride_participant(UUID, UUID) FROM PUBLIC, anon;

CREATE POLICY "pets_driver_select_for_ride" ON public.pets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rides r WHERE r.pet_id = pets.id AND r.driver_id = auth.uid()
));

CREATE TABLE public.ride_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ride_messages_ride_idx ON public.ride_messages (ride_id, created_at);
GRANT SELECT, INSERT ON public.ride_messages TO authenticated;
GRANT ALL ON public.ride_messages TO service_role;
ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_participants_select" ON public.ride_messages FOR SELECT TO authenticated
USING (public.is_ride_participant(ride_id, auth.uid()));
CREATE POLICY "messages_participants_insert" ON public.ride_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND public.is_ride_participant(ride_id, auth.uid()));

CREATE TABLE public.ride_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  rating SMALLINT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ride_id, reviewer_id),
  CONSTRAINT ride_reviews_rating_range CHECK (rating BETWEEN 1 AND 5)
);
CREATE INDEX ride_reviews_reviewee_idx ON public.ride_reviews (reviewee_id);
GRANT SELECT, INSERT ON public.ride_reviews TO authenticated;
GRANT ALL ON public.ride_reviews TO service_role;
ALTER TABLE public.ride_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_authenticated" ON public.ride_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "reviews_insert_participant" ON public.ride_reviews FOR INSERT TO authenticated
WITH CHECK (
  reviewer_id = auth.uid()
  AND reviewer_id <> reviewee_id
  AND EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.id = ride_id
      AND r.status = 'completed'
      AND (r.tutor_id = auth.uid() OR r.driver_id = auth.uid())
      AND (r.tutor_id = reviewee_id OR r.driver_id = reviewee_id)
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;