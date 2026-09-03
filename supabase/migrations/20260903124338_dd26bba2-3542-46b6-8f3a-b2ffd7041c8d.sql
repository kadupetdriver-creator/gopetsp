CREATE TABLE public.ride_dispatches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ride_dispatches_ride_id_idx ON public.ride_dispatches(ride_id);

GRANT SELECT ON public.ride_dispatches TO authenticated;
GRANT ALL ON public.ride_dispatches TO service_role;

ALTER TABLE public.ride_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ride_dispatches_select_own_ride" ON public.ride_dispatches
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.tutor_id = auth.uid()));