import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { adminAddAdmin, adminListAdmins, adminRemoveAdmin } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/administradores")({
  head: () => ({
    meta: [
      { title: "Administradores | GoPet Admin" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Gerencie quem tem acesso de administração na GoPet." },
      { property: "og:title", content: "Administradores | GoPet Admin" },
      { property: "og:description", content: "Gerencie quem tem acesso de administração na GoPet." },
    ],
  }),
  component: AdminAdministradoresPage,
});

function AdminAdministradoresPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(adminListAdmins);
  const add = useServerFn(adminAddAdmin);
  const remove = useServerFn(adminRemoveAdmin);
  const [email, setEmail] = useState("");

  const admins = useQuery({
    queryKey: ["admin-admins"],
    queryFn: () => list({ data: undefined }),
  });

  const addMutation = useMutation({
    mutationFn: () => add({ data: { email } }),
    onSuccess: () => {
      toast.success("Administrador adicionado.");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["admin-admins"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível adicionar."),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => remove({ data: { userId } }),
    onSuccess: () => {
      toast.success("Acesso removido.");
      void qc.invalidateQueries({ queryKey: ["admin-admins"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
  });

  const valid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim());

  return (
    <div className="space-y-5">
      <Card className="shadow-soft">
        <CardContent className="space-y-3 py-5">
          <div className="grid gap-1.5">
            <Label htmlFor="admin-email">E-mail da conta</Label>
            <Input
              id="admin-email"
              type="email"
              placeholder="pessoa@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A pessoa precisa já ter uma conta na GoPet. Administradores têm acesso total ao painel.
          </p>
          <Button
            className="w-full sm:w-auto"
            disabled={!valid || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 size-4" />
            )}
            Adicionar administrador
          </Button>
        </CardContent>
      </Card>

      {admins.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}

      <div className="grid gap-3">
        {(admins.data?.admins ?? []).map((a) => (
          <Card key={a.userId} className="shadow-soft">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="size-4 text-primary-ink" />
                  {a.fullName || a.email}
                  {a.userId === user?.id && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      você
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {a.email} · desde {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={a.userId === user?.id || removeMutation.isPending}
                onClick={() => removeMutation.mutate(a.userId)}
              >
                <Trash2 className="mr-2 size-4" /> Remover
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
