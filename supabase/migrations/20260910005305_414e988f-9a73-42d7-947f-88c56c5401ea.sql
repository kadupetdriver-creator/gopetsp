CREATE OR REPLACE FUNCTION public.guard_protected_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _email text;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = OLD.user_id;
  IF _email = 'kadupetdriver@gmail.com' AND OLD.role = 'admin' THEN
    RAISE EXCEPTION 'Este administrador é protegido e não pode ser removido.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER user_roles_guard_protected_admin
BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_protected_admin();