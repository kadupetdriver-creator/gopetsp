CREATE TABLE public.favorite_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  address text NOT NULL CHECK (char_length(address) BETWEEN 3 AND 300),
  neighborhood text,
  lat double precision NOT NULL CHECK (lat BETWEEN -24.1 AND -23.1),
  lng double precision NOT NULL CHECK (lng BETWEEN -47.1 AND -46.05),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX favorite_addresses_user_idx ON public.favorite_addresses(user_id);
GRANT SELECT, INSERT, DELETE ON public.favorite_addresses TO authenticated;
GRANT ALL ON public.favorite_addresses TO service_role;
ALTER TABLE public.favorite_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY fav_select_own ON public.favorite_addresses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY fav_insert_own ON public.favorite_addresses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY fav_delete_own ON public.favorite_addresses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY fav_admin_read ON public.favorite_addresses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));