import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Car, Route as RouteIcon, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração | GoPet" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Painel interno de administração da GoPet." },
      { property: "og:title", content: "Administração | GoPet" },
      { property: "og:description", content: "Painel interno de administração da GoPet." },
    ],
  }),
  component: AdminLayout,
});

const sections = [
  { to: "/admin/tutores", label: "Tutores", icon: Users },
  { to: "/admin/motoristas", label: "Motoristas", icon: Car },
  { to: "/admin/corridas", label: "Corridas", icon: RouteIcon },
  { to: "/admin/administradores", label: "Administradores", icon: ShieldCheck },
] as const;

function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Área restrita</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta página é exclusiva da equipe de administração da GoPet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-ink">GoPet Admin</p>
          <h1 className="text-3xl font-semibold">Administração</h1>
        </div>
      </div>
      <nav className="mt-5 flex gap-1 overflow-x-auto rounded-full bg-secondary p-1">
        {sections.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "bg-background text-foreground shadow-soft" }}
          >
            <s.icon className="size-4" /> {s.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
