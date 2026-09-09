import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Car, ChevronRight, Loader2, PawPrint, ShieldCheck, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/hooks/useRoleGuard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GoPet — Transporte de pets em São Paulo" },
      {
        name: "description",
        content:
          "Peça uma corrida para o seu pet em São Paulo: motoristas parceiros verificados, acompanhamento em tempo real e preço definido antes de confirmar.",
      },
      { property: "og:title", content: "GoPet — Transporte de pets em São Paulo" },
      {
        property: "og:description",
        content:
          "Marketplace de corridas pet em São Paulo, com motoristas verificados e acompanhamento em tempo real.",
      },
    ],
  }),
  component: Splash,
});

const options = [
  {
    to: "/auth",
    search: { papel: "tutor" as const },
    icon: PawPrint,
    title: "Sou Tutor",
    text: "Peça uma corrida para o seu pet e acompanhe em tempo real.",
    tone: "bg-primary text-primary-foreground hover:bg-primary/90",
    iconTone: "bg-primary-foreground/15 text-primary-foreground",
  },
  {
    to: "/auth",
    search: { papel: "motorista" as const },
    icon: Car,
    title: "Sou Motorista",
    text: "Entre para ver chamadas, relatórios e dados do seu veículo.",
    tone: "bg-foreground text-background hover:bg-foreground/90",
    iconTone: "bg-background/15 text-background",
  },
  {
    to: "/auth",
    search: { papel: "tutor" as const, next: "/seja-motorista" },
    icon: Sparkles,
    title: "Quero ser Motorista",
    text: "Já tem conta de tutor? Envie seus documentos e vire parceiro GoPet.",
    tone: "bg-card text-foreground ring-1 ring-border hover:bg-secondary",
    iconTone: "bg-primary/15 text-primary-ink",
  },
];

function Splash() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  // Sessão ativa: pula a escolha e vai direto para a tela do papel atual.
  useEffect(() => {
    if (!loading && user && profile) {
      void navigate({ to: homeForRole(profile), replace: true });
    }
  }, [loading, user, profile, navigate]);

  const deciding = loading || (!!user && !profile) || (!!user && !!profile);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <BrandLogo size={128} withWordmark={false} />
      <h1 className="mt-6 text-center text-3xl font-semibold leading-tight">
        Go<span className="text-primary-ink">Pet</span>
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Transporte de pets com carinho na cidade de São Paulo.
      </p>

      {deciding ? (
        <div className="mt-12 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Entrando…
        </div>
      ) : (
        <>
          <p className="mt-10 self-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Como você quer entrar?
          </p>
          <div className="mt-3 flex w-full flex-col gap-3">
            {options.map((o) => (
              <Link
                key={o.title}
                to={o.to}
                search={o.search}
                className={`flex items-center gap-4 rounded-2xl px-4 py-4 shadow-soft transition-colors ${o.tone}`}
              >
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${o.iconTone}`}>
                  <o.icon className="size-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-base font-semibold">{o.title}</span>
                  <span className="block text-xs opacity-80">{o.text}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 opacity-70" />
              </Link>
            ))}
          </div>

          <p className="mt-8 inline-flex items-center gap-2 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary-ink" />
            Motoristas parceiros com documentos e veículo verificados.
          </p>
        </>
      )}
    </div>
  );
}
