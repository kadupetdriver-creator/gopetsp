CREATE TABLE public.ride_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, pet_id)
);

GRANT SELECT, INSERT, DELETE ON public.ride_pets TO authenticated;
GRANT ALL ON public.ride_pets TO service_role;

ALTER TABLE public.ride_pets ENABLE ROW LEVEL SECURITY;

CREATE POLICY ride_pets_select_participants ON public.ride_pets
  FOR SELECT TO authenticated
  USING (public.is_ride_participant(ride_id, auth.uid()));

CREATE POLICY ride_pets_tutor_insert ON public.ride_pets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.tutor_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid())
  );

CREATE POLICY ride_pets_tutor_delete ON public.ride_pets
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.tutor_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_ride_pets_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.ride_pets WHERE ride_id = NEW.ride_id) > 3 THEN
    RAISE EXCEPTION 'Máximo de 3 pets por corrida';
  END IF;
  RETURN NEW;
END; $$;

CREATE CONSTRAINT TRIGGER ride_pets_limit
AFTER INSERT ON public.ride_pets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_ride_pets_limit();

CREATE POLICY pets_driver_select_for_ride_pets ON public.pets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ride_pets rp
    JOIN public.rides r ON r.id = rp.ride_id
    WHERE rp.pet_id = pets.id AND r.driver_id = auth.uid()
  ));

INSERT INTO public.ride_pets (ride_id, pet_id)
SELECT id, pet_id FROM public.rides WHERE pet_id IS NOT NULL
ON CONFLICT DO NOTHING;