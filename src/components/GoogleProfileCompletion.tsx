import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskCPF, maskPhone } from "@/lib/drivers";
import { parseCompletion } from "@/lib/profile-completion";
import { completeGoogleProfile } from "@/lib/profile-completion.functions";

export function GoogleProfileCompletion() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const save = useServerFn(completeGoogleProfile);
  const [cpf, setCpf] = useState(profile?.cpf ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <BrandLogo size={88} withWordmark={false} />
        <h1 className="mt-5 text-3xl font-semibold">Complete seu cadastro</h1>
        <p className="mt-2 text-sm text-muted-foreground">CPF, telefone e e-mail são obrigatórios para entrar na GoPet.</p>
      </div>
      <form className="space-y-5" onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
          const data = parseCompletion({ cpf, phone, email: user?.email ?? "" });
          await save({ data });
          await refreshProfile();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Não foi possível salvar. Tente novamente.");
        } finally {
          setBusy(false);
        }
      }}>
        <div className="space-y-2">
          <Label htmlFor="complete-cpf">CPF</Label>
          <Input id="complete-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={maskCPF(cpf)} onChange={(e) => setCpf(maskCPF(e.target.value))} required disabled={busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="complete-phone">Telefone / WhatsApp</Label>
          <Input id="complete-phone" type="tel" autoComplete="tel" placeholder="(11) 90000-0000" value={maskPhone(phone)} onChange={(e) => setPhone(maskPhone(e.target.value))} required disabled={busy} />
          <PhoneValidityWarning />
        </div>
        <div className="space-y-2">
          <Label htmlFor="complete-email">E-mail</Label>
          <Input id="complete-email" type="email" autoComplete="email" value={user?.email ?? ""} readOnly required />
          <p className="text-xs text-muted-foreground">E-mail confirmado pela sua conta Google.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar e acessar
        </Button>
      </form>
      <Button variant="ghost" disabled={busy} onClick={async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await signOut();
      }}><LogOut className="mr-2 size-4" /> Sair da conta</Button>
    </div>
  );
}