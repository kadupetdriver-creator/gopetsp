CREATE OR REPLACE FUNCTION public.notify_review_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 PERFORM realtime.send('{}'::jsonb, 'rating_updated', 'review-summary:' || NEW.reviewee_id::text, true);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_review_summary() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_review_summary_after_insert AFTER INSERT ON public.ride_reviews FOR EACH ROW EXECUTE FUNCTION public.notify_review_summary();
CREATE POLICY review_summary_broadcast_owner ON realtime.messages FOR SELECT TO authenticated USING (realtime.topic() = 'review-summary:' || auth.uid()::text);