-- ===== Enums =====
CREATE TYPE public.platform_role AS ENUM ('admin');
CREATE TYPE public.driver_status AS ENUM ('pendente', 'em_analise', 'aprovado', 'rejeitado');
CREATE TYPE public.driver_document_type AS ENUM ('cnh', 'crlv', 'comprovante_residencia');
CREATE TYPE public.document_status AS ENUM ('pendente', 'aprovado', 'rejeitado');

-- ===== user_roles (admin) =====
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.platform_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.platform_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.platform_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.platform_role) TO authenticated, service_role;

CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ===== drivers =====
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cpf text NOT NULL,
  birth_date date NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  city text NOT NULL DEFAULT 'São Paulo',
  neighborhood text NOT NULL DEFAULT '',
  avatar_path text,
  status public.driver_status NOT NULL DEFAULT 'pendente',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivers_status_idx ON public.drivers(status);
GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY drivers_select_own_or_admin ON public.drivers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY drivers_insert_own ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pendente' AND rejection_reason IS NULL
              AND reviewed_at IS NULL AND reviewed_by IS NULL);

CREATE POLICY drivers_update_own ON public.drivers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_drivers_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
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

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'rejeitado' AND NEW.status = 'pendente') THEN
    RAISE EXCEPTION 'O status de aprovação só pode ser alterado por um administrador';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_drivers_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER drivers_guard_update BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.guard_drivers_update();

-- ===== vehicles =====
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
  plate text NOT NULL,
  model text NOT NULL,
  brand text NOT NULL,
  year integer NOT NULL,
  color text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'hatch',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicles_select_own_or_admin ON public.vehicles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = vehicles.driver_id AND d.user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY vehicles_insert_own ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = vehicles.driver_id AND d.user_id = auth.uid()));

CREATE POLICY vehicles_update_own ON public.vehicles
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = vehicles.driver_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = vehicles.driver_id AND d.user_id = auth.uid()));

CREATE POLICY vehicles_delete_own ON public.vehicles
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = vehicles.driver_id AND d.user_id = auth.uid()));

CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== driver_documents =====
CREATE TABLE public.driver_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  document_type public.driver_document_type NOT NULL,
  file_path text NOT NULL,
  status public.document_status NOT NULL DEFAULT 'pendente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, document_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_documents TO authenticated;
GRANT ALL ON public.driver_documents TO service_role;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY driver_documents_select_own_or_admin ON public.driver_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY driver_documents_insert_own ON public.driver_documents
  FOR INSERT TO authenticated
  WITH CHECK (status = 'pendente' AND notes IS NULL
              AND EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.user_id = auth.uid()));

CREATE POLICY driver_documents_update_own_or_admin ON public.driver_documents
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY driver_documents_delete_own ON public.driver_documents
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.user_id = auth.uid()));

CREATE TRIGGER driver_documents_updated_at BEFORE UPDATE ON public.driver_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_driver_documents_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR uid IS NULL OR public.has_role(uid, 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id OR NEW.document_type IS DISTINCT FROM OLD.document_type THEN
    RAISE EXCEPTION 'Documento não pode ser movido para outro cadastro';
  END IF;
  -- Reenvio de arquivo pelo motorista volta o documento para "pendente".
  IF NEW.file_path IS DISTINCT FROM OLD.file_path THEN
    NEW.status := 'pendente';
    NEW.notes := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'A verificação do documento só pode ser alterada por um administrador';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_driver_documents_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER driver_documents_guard_update BEFORE UPDATE ON public.driver_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_driver_documents_update();

-- ===== Revisão pelo admin =====
CREATE OR REPLACE FUNCTION public.review_driver_application(
  _driver_id uuid,
  _status public.driver_status,
  _reason text DEFAULT NULL
)
RETURNS public.drivers
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  d public.drivers;
  v public.vehicles;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar cadastros de motoristas';
  END IF;
  IF _status NOT IN ('em_analise', 'aprovado', 'rejeitado') THEN
    RAISE EXCEPTION 'Status de revisão inválido';
  END IF;
  IF _status = 'rejeitado' AND coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo da rejeição';
  END IF;

  UPDATE public.drivers
     SET status = _status,
         rejection_reason = CASE WHEN _status = 'rejeitado' THEN btrim(_reason) ELSE NULL END,
         reviewed_at = now(),
         reviewed_by = uid
   WHERE id = _driver_id
  RETURNING * INTO d;

  IF d.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro de motorista não encontrado';
  END IF;

  PERFORM set_config('gopet.bypass_profile_guard', 'on', true);
  IF _status = 'aprovado' THEN
    SELECT * INTO v FROM public.vehicles WHERE driver_id = d.id LIMIT 1;
    UPDATE public.profiles
       SET role = 'driver'::public.app_role,
           full_name = CASE WHEN coalesce(full_name, '') = '' THEN d.full_name ELSE full_name END,
           phone = coalesce(phone, d.phone),
           vehicle_model = coalesce(nullif(concat_ws(' ', v.brand, v.model, v.year::text), ''), vehicle_model),
           vehicle_plate = coalesce(v.plate, vehicle_plate)
     WHERE id = d.user_id;
  ELSE
    UPDATE public.profiles
       SET role = 'tutor'::public.app_role
     WHERE id = d.user_id AND role = 'driver'::public.app_role;
  END IF;
  PERFORM set_config('gopet.bypass_profile_guard', 'off', true);

  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.review_driver_application(uuid, public.driver_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_driver_application(uuid, public.driver_status, text) TO authenticated, service_role;

-- ===== Storage: bucket privado driver-documents =====
CREATE POLICY driver_docs_select_own_or_admin ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'driver-documents'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY driver_docs_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY driver_docs_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY driver_docs_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text);