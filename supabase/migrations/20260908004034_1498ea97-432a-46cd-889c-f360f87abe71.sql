-- Corridas passam a ser criadas exclusivamente pelo backend (server function),
-- que valida os pets do tutor e calcula distância e preço. Isso impede que um
-- cliente manipulado insira price_cents/distance_km arbitrários.
DROP POLICY IF EXISTS "rides_tutor_insert" ON public.rides;
REVOKE INSERT ON public.rides FROM authenticated;
GRANT SELECT, UPDATE, DELETE ON public.rides TO authenticated;
GRANT ALL ON public.rides TO service_role;