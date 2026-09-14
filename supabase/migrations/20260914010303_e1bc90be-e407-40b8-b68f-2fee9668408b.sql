ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS return_of_ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rides_return_of_ride_id_idx ON public.rides(return_of_ride_id);