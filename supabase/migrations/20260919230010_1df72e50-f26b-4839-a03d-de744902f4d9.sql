-- Funções internas/gatilho: ninguém chama diretamente via API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_driver_documents_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_drivers_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profiles_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_protected_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_rides_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_eta_calibration(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_eta_calibration(integer) TO service_role;

-- Funções usadas pelo app: apenas usuários logados (elas já validam permissão internamente)
REVOKE EXECUTE ON FUNCTION public.accept_ride(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ride(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_ride_status(uuid, ride_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ride_status(uuid, ride_status) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_driver_arrived(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_driver_arrived(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ride_counterpart_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ride_counterpart_contact(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_driver_application(uuid, driver_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_driver_application(uuid, driver_status, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_user_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_emails() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, platform_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, platform_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_driver(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_ride_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_ride_participant(uuid, uuid) TO authenticated;

-- Nova função de leitura da calibração de trânsito: apenas usuários logados
REVOKE EXECUTE ON FUNCTION public.eta_avg_speed(smallint, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eta_avg_speed(smallint, smallint) TO authenticated;

-- cpf_disponivel é usada na tela pública de cadastro (antes do login): mantém acesso anônimo
GRANT EXECUTE ON FUNCTION public.cpf_disponivel(text) TO anon, authenticated;