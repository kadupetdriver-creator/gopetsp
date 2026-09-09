import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Car, Loader2 } from "lucide-react";
import { z } from "zod";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  papel: z.enum(["tutor", "motorista"]).optional(),
  next: z.string().startsWith("/").optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta | GoPet" },
      {
        name: "description",
        content:
          "Acesse a GoPet para pedir transporte do seu pet em São Paulo com motoristas parceiros verificados.",
      },
      { property: "og:title", content: "Entrar ou criar conta | GoPet" },
      {
        property: "og:description",
        content: "Conta de tutor para transporte de pets em São Paulo.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { papel, next } = Route.useSearch();
  const driverMode = papel === "motorista";
  const { user, profile, loading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Após o login, o papel do perfil decide a tela — nunca a escolha feita na tela inicial.
  useEffect(() => {
    if (loading || !user || !profile) return;
    const home = homeForRole(profile);
    const target = profile.role === "tutor" && next ? next : home;
    void navigate({ to: target, replace: true });
  }, [loading, user, profile, next, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, phone, role: "tutor" },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta criada! Confirme o e-mail que enviamos para começar.");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível entrar. Verifique e-mail e senha.");
      return;
    }
    toast.success("Bem-vindo de volta!");
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <BrandLogo size={104} withWordmark={false} className="mb-4" />
        {driverMode ? (
          <>
            <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
              <Car className="size-3.5" /> Área do motorista parceiro
            </span>
            <h1 className="text-3xl font-semibold">Entrar como motorista</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use o e-mail e a senha da sua conta GoPet. Seu acesso segue o status do seu cadastro.
            </p>
          </>
        ) : next === "/seja-motorista" ? (
          <>
            <h1 className="text-3xl font-semibold">Quero ser motorista</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Entre (ou crie sua conta de tutor) para enviar a solicitação de motorista parceiro.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold">Vamos cuidar do seu pet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Transporte seguro de animais em toda São Paulo, com motoristas treinados.
            </p>
          </>
        )}
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>{driverMode ? "Acesso do motorista" : "Acesse a GoPet"}</CardTitle>
          <CardDescription>
            {driverMode
              ? "Motoristas não criam conta por aqui: a conta de tutor é promovida após aprovação dos documentos."
              : "Crie sua conta de tutor e peça corridas para o seu pet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={driverMode ? "signin" : "signup"}>
            <TabsList className={driverMode ? "hidden" : "grid w-full grid-cols-2"}>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
              <TabsTrigger value="signin">Entrar</TabsTrigger>
            </TabsList>

            <TabsContent value="signup" className="mt-5">
              <form className="space-y-4" onSubmit={handleSignUp}>

                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">WhatsApp</Label>
                  <Input
                    id="phone"
                    placeholder="(11) 90000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Criar conta
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signin" className="mt-5">
              <form className="space-y-4" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="email-in">E-mail</Label>
                  <Input
                    id="email-in"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-in">Senha</Label>
                  <Input
                    id="password-in"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Entrar
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            Continuar com Google
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Ao continuar você concorda com nossos termos de uso.{" "}
        <Link to="/" className="underline">
          Voltar ao início
        </Link>
      </p>
    </div>
  );
}
