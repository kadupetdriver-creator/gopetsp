ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS needs_trunk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trunk_fee_cents integer NOT NULL DEFAULT 0;