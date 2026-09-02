ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verifications_user_idx ON public.phone_verifications (user_id, created_at DESC);

GRANT ALL ON public.phone_verifications TO service_role;

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS phone_verifications_updated_at ON public.phone_verifications;
CREATE TRIGGER phone_verifications_updated_at
  BEFORE UPDATE ON public.phone_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();