CREATE TABLE public.photo_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('driver','tutor')),
  file_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','replaced')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.photo_change_requests TO authenticated;
GRANT ALL ON public.photo_change_requests TO service_role;
ALTER TABLE public.photo_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_requests_select_own_or_admin" ON public.photo_change_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX photo_change_requests_pending_idx ON public.photo_change_requests (status, created_at);
CREATE TRIGGER photo_change_requests_updated_at BEFORE UPDATE ON public.photo_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.submit_photo_change(_kind text, _path text)
RETURNS public.photo_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE uid uuid := auth.uid(); r public.photo_change_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Faça login para continuar'; END IF;
  IF _kind NOT IN ('driver','tutor') THEN RAISE EXCEPTION 'Tipo de foto inválido'; END IF;
  IF coalesce(_path,'') = '' OR split_part(_path, '/', 1) <> uid::text THEN
    RAISE EXCEPTION 'Arquivo de foto inválido';
  END IF;
  IF _kind = 'driver' AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE user_id = uid) THEN
    RAISE EXCEPTION 'Cadastro de motorista não encontrado';
  END IF;
  UPDATE public.photo_change_requests SET status = 'replaced'
   WHERE user_id = uid AND kind = _kind AND status = 'pending';
  INSERT INTO public.photo_change_requests (user_id, kind, file_path)
  VALUES (uid, _kind, _path) RETURNING * INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.review_photo_change(_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS public.photo_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE uid uuid := auth.uid(); r public.photo_change_requests;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar fotos';
  END IF;
  SELECT * INTO r FROM public.photo_change_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitação já foi revisada'; END IF;
  IF NOT _approve AND coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo'; END IF;

  UPDATE public.photo_change_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         rejection_reason = CASE WHEN _approve THEN NULL ELSE btrim(_reason) END,
         reviewed_by = uid, reviewed_at = now()
   WHERE id = _id RETURNING * INTO r;

  IF _approve THEN
    IF r.kind = 'driver' THEN
      UPDATE public.drivers SET avatar_path = r.file_path WHERE user_id = r.user_id;
    ELSE
      PERFORM set_config('gopet.bypass_profile_guard', 'on', true);
      UPDATE public.profiles SET avatar_url = r.file_path WHERE id = r.user_id;
      PERFORM set_config('gopet.bypass_profile_guard', 'off', true);
    END IF;
  END IF;
  RETURN r;
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_photo_change(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_photo_change(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_photo_change(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_photo_change(uuid, boolean, text) TO authenticated;

-- Foto do motorista aprovado e foto do tutor só mudam via aprovação
CREATE OR REPLACE FUNCTION public.guard_drivers_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR uid IS NULL OR public.has_role(uid, 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'Campos de revisão do cadastro não podem ser alterados pelo motorista';
  END IF;
  IF OLD.status = 'aprovado' AND NEW.avatar_path IS DISTINCT FROM OLD.avatar_path THEN
    RAISE EXCEPTION 'A nova foto precisa ser aprovada pelo administrador';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'rejeitado' AND NEW.status = 'pendente') THEN
    RAISE EXCEPTION 'O status de aprovação só pode ser alterado por um administrador';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_profiles_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'service_role'
     OR auth.uid() IS NULL
     OR coalesce(current_setting('gopet.bypass_profile_guard', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin') THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Campos protegidos do perfil não podem ser alterados diretamente';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.cpf IS DISTINCT FROM OLD.cpf
     OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Campos privilegiados do perfil não podem ser alterados pelo usuário';
  END IF;
  RETURN NEW;
END; $function$;