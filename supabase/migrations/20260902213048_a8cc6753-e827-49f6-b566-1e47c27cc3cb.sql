DROP TABLE IF EXISTS public.phone_verifications;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone_verified;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone_verified_at;