import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSetTutorPassword } from "@/lib/admin-tutors.functions";

export function AdminTutorPasswordForm({ tutorId }: { tutorId: string }) {
  const setPassword = useServerFn(adminSetTutorPassword);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pwd.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (pwd !== confirm) return toast.error("As senhas não conferem.");
    setBusy(true);
    try {
      await setPassword({ data: { tutorId, password: pwd } });
      toast.success("Senha alterada. Informe a nova senha ao tutor.");
      setPwd(""); setConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar a senha.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border px-3 py-3">
      <p className="text-sm font-medium">Alterar senha</p>
      <Input type="password" autoComplete="new-password" placeholder="Nova senha (mín. 8 caracteres)" value={pwd} onChange={(e) => setPwd(e.target.value)} />
      <Input type="password" autoComplete="new-password" placeholder="Confirmar nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <Button type="button" variant="outline" size="sm" disabled={busy || !pwd} onClick={submit}>
        {busy ? "Salvando…" : "Salvar nova senha"}
      </Button>
    </div>
  );
}
