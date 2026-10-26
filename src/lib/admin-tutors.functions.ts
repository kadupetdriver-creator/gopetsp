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
