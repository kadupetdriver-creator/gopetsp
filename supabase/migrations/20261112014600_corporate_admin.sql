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
  IF _email IN ('gopetsp@gopetsp.com.br', 'kadupetdriver@gmail.com') AND OLD.role = 'admin' THEN
    RAISE EXCEPTION 'Este administrador é protegido e não pode ser removido.';
  END IF;
  RETURN OLD;
END;
$$;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE lower(email) = 'gopetsp@gopetsp.com.br'
ON CONFLICT DO NOTHING;
