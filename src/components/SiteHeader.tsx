import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = user
    ? profile?.role === "driver"
      ? [
          { to: "/motorista", label: "Chamadas" },
          { to: "/rastreio", label: "Rastreio ao vivo" },
          { to: "/pagamentos", label: "Repasses" },
          { to: "/perfil", label: "Meu perfil" },
        ]
      : [
          { to: "/solicitar", label: "Solicitar corrida" },
          { to: "/minhas-corridas", label: "Minhas corridas" },
          { to: "/rastreio", label: "Rastreio ao vivo" },
          { to: "/creditos", label: "Créditos" },
          { to: "/pagamentos", label: "Pagamentos" },
          { to: "/perfil", label: "Meu perfil" },
          { to: "/seja-motorista", label: "Seja parceiro" },
        ]
    : [
        { to: "/", label: "Início" },
        { to: "/auth", label: "Entrar" },
      ];
  if (user && isAdmin) links.push({ to: "/admin/motoristas", label: "Aprovações" });

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <BrandLogo asLink size={40} />

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 gap-2"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/" });
              }}
            >
              <LogOut className="size-4" /> Sair
            </Button>
          ) : (
            <Button asChild size="sm" className="ml-2 rounded-full">
              <Link to="/auth">Criar conta</Link>
            </Button>
          )}
        </nav>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Abrir menu"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu className="size-5" />
        </Button>
      </div>

      <div className={cn("border-t border-border/70 px-4 py-2 md:hidden", open ? "block" : "hidden")}>
        <div className="flex flex-col">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
          {user && (
            <button
              className="rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-secondary"
              onClick={async () => {
                setOpen(false);
                await signOut();
                void navigate({ to: "/" });
              }}
            >
              Sair
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
