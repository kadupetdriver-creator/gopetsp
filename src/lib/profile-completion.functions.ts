import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canSetRegistrationCpf, parseCompletion } from "./profile-completion";

export const completeGoogleProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cpf: string; phone: string; email: string }) => parseCompletion(input))
  .handler(async ({ data, context }) => {
    const { data: auth, error: authError } = await context.supabase.auth.getUser();
    if (authError || !auth.user || auth.user.id !== context.userId) throw new Error("Entre novamente para completar o cadastro.");
    if (data.email !== auth.user.email?.trim().toLowerCase()) throw new Error("Use o e-mail da sua conta Google.");
    const { data: profile, error: readError } = await context.supabase.from("profiles").select("cpf").eq("id", context.userId).single();
    if (readError || !profile) throw new Error("Não foi possível carregar seu cadastro. Tente novamente.");
    if (!canSetRegistrationCpf(profile.cpf, data.cpf)) throw new Error("O CPF já cadastrado não pode ser alterado.");
    // The CPF is protected against browser edits. This narrow owner-authorized
    // update changes only registration fields; the unique index handles races.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let update = supabaseAdmin.from("profiles").update({ cpf: data.cpf, phone: data.phone }).eq("id", context.userId);
    update = profile.cpf === null ? update.is("cpf", null) : update.eq("cpf", profile.cpf);
    const { data: saved, error } = await update.select("id").maybeSingle();
    if (error?.code === "23505") throw new Error("Já existe uma conta cadastrada com este CPF.");
    if (error || !saved) throw new Error("Não foi possível salvar seu cadastro. Confira os dados e tente novamente.");
    return { ok: true };
  });