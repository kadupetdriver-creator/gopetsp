import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCPF, isValidPhone, onlyDigits } from "./drivers";

const schema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  cpf: z.string(),
  phone: z.string(),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(72),
});

export const adminCreateTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Apenas administradores podem cadastrar tutores.");
    const cpf = onlyDigits(data.cpf);
    const phone = onlyDigits(data.phone);
    if (!isValidCPF(cpf)) throw new Error("CPF inválido.");
    if (!isValidPhone(phone)) throw new Error("Telefone inválido. Use DDD + número.");
    const { data: available } = await context.supabase.rpc("cpf_disponivel", { _cpf: cpf });
    if (available === false) throw new Error("Já existe uma conta cadastrada com este CPF.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone, cpf, role: "tutor" },
    });
    if (error || !created.user) {
      const msg = error?.message ?? "";
      if (/already|registered|exists/i.test(msg)) throw new Error("Este e-mail já está cadastrado.");
      if (/CPF/i.test(msg)) throw new Error("Já existe uma conta cadastrada com este CPF.");
      throw new Error("Não foi possível criar o cadastro. Tente novamente.");
    }
    console.info("[admin-tutor-created]", { tutorId: created.user.id, adminId: context.userId, at: new Date().toISOString() });
    return { id: created.user.id };
  });

const PHOTO_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const adminAddTutorPet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    tutorId: z.string().uuid(),
    name: z.string().trim().min(1, "Informe o nome do pet.").max(60),
    species: z.string().trim().min(1, "Selecione a espécie do pet.").max(30),
    size: z.string().trim().min(1).max(30),
    photo: z.object({ base64: z.string().max(7_000_000), type: z.string() }).nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Apenas administradores podem cadastrar pets para tutores.");
    const { data: tutor } = await context.supabase.from("profiles").select("id, role").eq("id", data.tutorId).maybeSingle();
    if (!tutor) throw new Error("Tutor não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pet, error } = await supabaseAdmin.from("pets")
      .insert({ owner_id: data.tutorId, name: data.name, species: data.species, size: data.size })
      .select("id").single();
    if (error || !pet) throw new Error("Não foi possível cadastrar o pet.");
    if (data.photo) {
      const ext = PHOTO_EXT[data.photo.type];
      if (!ext) throw new Error("Pet cadastrado, mas a foto precisa ser JPG, PNG ou WebP.");
      const bytes = Uint8Array.from(atob(data.photo.base64), (c) => c.charCodeAt(0));
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Pet cadastrado, mas a foto deve ter no máximo 5 MB.");
      const path = `${data.tutorId}/${pet.id}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage.from("pet-photos")
        .upload(path, bytes, { upsert: true, contentType: data.photo.type });
      if (upErr) throw new Error("Pet cadastrado, mas não foi possível enviar a foto.");
      await supabaseAdmin.from("pets").update({ photo_url: path }).eq("id", pet.id);
    }
    console.info("[admin-pet-created]", { petId: pet.id, tutorId: data.tutorId, adminId: context.userId, at: new Date().toISOString() });
    return { id: pet.id };
  });

export const adminSetTutorPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    tutorId: z.string().uuid(),
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(72),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Apenas administradores podem alterar senhas.");
    const { data: tutor } = await context.supabase.from("profiles").select("id").eq("id", data.tutorId).maybeSingle();
    if (!tutor) throw new Error("Tutor não encontrado.");
    const { data: target } = await context.supabase.rpc("has_role", { _user_id: data.tutorId, _role: "admin" });
    if (target === true && data.tutorId !== context.userId) throw new Error("Não é possível alterar a senha de outro administrador.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.tutorId, { password: data.password });
    if (error) throw new Error("Não foi possível alterar a senha. Tente novamente.");
    console.info("[admin-tutor-password-changed]", { tutorId: data.tutorId, adminId: context.userId, at: new Date().toISOString() });
    return { ok: true };
  });
