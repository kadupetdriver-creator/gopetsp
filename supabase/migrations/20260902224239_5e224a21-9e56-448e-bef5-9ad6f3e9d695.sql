GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_ride_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_profile(uuid, uuid) TO authenticated;