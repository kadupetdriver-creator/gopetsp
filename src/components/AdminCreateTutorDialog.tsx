import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { adminCreateTutor } from "@/lib/admin-tutors.functions";
import { maskCPF, maskPhone } from "@/lib/drivers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneValidityWarning } from "@/components/PhoneValidityWarning";

const empty = { fullName: "", email: "", cpf: "", phone: "", password: "" };

export function AdminCreateTutorDialog() {
  const qc = useQueryClient();
  const create = useServerFn(adminCreateTutor);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: form });
      toast.success("Tutor cadastrado! Ele já pode entrar com o e-mail e a senha informados.");
      setForm(empty);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-tutors"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg.startsWith("[") ? "Confira os dados preenchidos." : msg || "Não foi possível cadastrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <UserPlus className="size-4" /> Novo tutor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar tutor</DialogTitle>
            <DialogDescription>A conta já fica confirmada. Passe o e-mail e a senha ao tutor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="nt-name">Nome completo</Label>
              <Input id="nt-name" required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="nt-email">E-mail</Label>
              <Input id="nt-email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="nt-cpf">CPF</Label>
              <Input id="nt-cpf" inputMode="numeric" required value={form.cpf} onChange={(e) => set("cpf", maskCPF(e.target.value))} placeholder="000.000.000-00" /></div>
            <div className="space-y-1"><Label htmlFor="nt-phone">Telefone (WhatsApp)</Label>
              <Input id="nt-phone" inputMode="tel" required value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} placeholder="(11) 90000-0000" />
              <PhoneValidityWarning /></div>
            <div className="space-y-1"><Label htmlFor="nt-pass">Senha inicial</Label>
              <Input id="nt-pass" type="text" minLength={8} required value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 8 caracteres" /></div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Cadastrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
