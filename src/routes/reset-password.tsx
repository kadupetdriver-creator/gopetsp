import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/PasswordInput";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha | GoPet" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "Recupere o acesso à sua conta GoPet: receba um link por e-mail e defina uma nova senha.",
      },
      { property: "og:title", content: "Redefinir senha | GoPet" },
      {
        property: "og:description",
        content: "Recupere o acesso à sua conta GoPet com um link enviado por e-mail.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "sent" | "recovery">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("type") === "recovery") setStep("recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStep("recovery");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível enviar o e-mail de recuperação. Tente novamente.");
      return;
    }
    setStep("sent");
    toast.success("Enviamos um link de recuperação para o seu e-mail.");
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível alterar a senha. Solicite um novo link de recuperação.");
      return;
    }
    toast.success("Senha alterada com sucesso!");
    void navigate({ to: "/" });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <BrandLogo size={104} withWordmark={false} className="mb-4" />
        <h1 className="text-3xl font-semibold">Redefinir senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {step === "recovery"
            ? "Escolha uma nova senha para a sua conta GoPet."
            : "Informe o e-mail da sua conta para receber o link de recuperação."}
        </p>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>{step === "recovery" ? "Nova senha" : "Recuperar acesso"}</CardTitle>
          <CardDescription>
            {step === "recovery"
              ? "A nova senha deve ter no mínimo 8 caracteres."
              : "Você receberá um e-mail da GoPet com um link para criar a nova senha."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "recovery" ? (
            <form className="space-y-4" onSubmit={handleUpdatePassword}>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <PasswordInput
                  id="new-password"
                  minLength={8}
                  title="A senha deve ter no mínimo 8 caracteres."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  A senha deve ter no mínimo 8 caracteres.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar nova senha
              </Button>
            </form>
          ) : step === "email" ? (
            <form className="space-y-4" onSubmit={handleRequestReset}>
              <div className="space-y-2">
                <Label htmlFor="recovery-email">E-mail</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Enviar link de recuperação
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Se o e-mail estiver correto, você receberá o link de recuperação em poucos minutos.
              Confira também a caixa de spam.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Lembrou a senha?{" "}
        <Link to="/auth" className="underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
