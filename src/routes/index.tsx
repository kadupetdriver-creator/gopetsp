import { createFileRoute, Link } from "@tanstack/react-router";
import { PawPrint, ShieldCheck, MapPinned, Clock, Star, MessageCircle } from "lucide-react";
import heroImg from "@/assets/hero-pet-transporte.jpg";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { spSubprefeituras } from "@/lib/rides";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PetMobi — Transporte de pets em São Paulo" },
      {
        name: "description",
        content:
          "Peça uma corrida para o seu pet em São Paulo: motoristas parceiros verificados, acompanhamento em tempo real e preço estimado antes de confirmar.",
      },
      { property: "og:title", content: "PetMobi — Transporte de pets em São Paulo" },
      {
        property: "og:description",
        content:
          "Marketplace de corridas pet em São Paulo, com motoristas verificados e acompanhamento em tempo real.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:py-20">
        <div>
          <BrandLogo size={96} withWordmark={false} className="mb-5" />
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            <PawPrint className="size-3.5 text-primary-ink" /> Só em São Paulo, com carinho
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
            O transporte do seu pet, com gente que entende de bicho
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Chame um motorista parceiro para levar seu animal ao veterinário, banho e tosa, creche
            ou aeroporto. Acompanhe a corrida em tempo real e converse com o motorista pelo app.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/solicitar">Solicitar corrida</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/auth">Quero dirigir</Link>
            </Button>
          </div>
          <dl className="mt-9 grid grid-cols-3 gap-4 border-t border-border pt-6">
            {[
              { k: "12 min", v: "tempo médio de aceite" },
              { k: "4,9", v: "nota média dos parceiros" },
              { k: "24/7", v: "chamadas na cidade" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-2xl font-semibold text-primary-ink">{s.k}</dt>
                <dd className="text-xs text-muted-foreground">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <img
            src={heroImg}
            width={1600}
            height={1104}
            alt="Motorista parceiro acomodando um cachorro em caixa de transporte em uma rua de São Paulo"
            className="w-full rounded-3xl object-cover shadow-soft"
          />
          <div className="absolute -bottom-6 left-6 hidden rounded-2xl bg-brand-canvas p-2 shadow-soft ring-1 ring-border sm:block">
            <BrandLogo size={72} withWordmark={false} />
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-card/60 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold sm:text-3xl">Como funciona</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: PawPrint,
                title: "1. Conte sobre o pet",
                text: "Nome, porte, temperamento e itens necessários para a viagem.",
              },
              {
                icon: MapPinned,
                title: "2. Informe o trajeto",
                text: "Endereço de embarque e destino em qualquer bairro de São Paulo.",
              },
              {
                icon: Clock,
                title: "3. Acompanhe em tempo real",
                text: "Veja o motorista a caminho, converse pelo chat e avalie no final.",
              },
            ].map((s) => (
              <Card key={s.title} className="shadow-soft">
                <CardContent className="space-y-3 py-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
                    <s.icon className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Segurança em primeiro lugar</h2>
            <ul className="mt-6 space-y-4">
              {[
                {
                  icon: ShieldCheck,
                  title: "Parceiros verificados",
                  text: "Documento, veículo e curso de manejo animal conferidos antes da primeira corrida.",
                },
                {
                  icon: MessageCircle,
                  title: "Chat durante a corrida",
                  text: "Fale com o motorista enquanto o transporte estiver ativo, com histórico salvo.",
                },
                {
                  icon: Star,
                  title: "Avaliação mútua",
                  text: "Tutor e motorista se avaliam ao final, mantendo a qualidade da comunidade.",
                },
              ].map((f) => (
                <li key={f.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent-foreground">
                    <f.icon className="size-4" />
                  </span>
                  <div>
                    <p className="font-semibold">{f.title}</p>
                    <p className="text-sm text-muted-foreground">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-gradient-warm p-8 text-primary-foreground shadow-soft">
            <h2 className="text-2xl font-semibold text-primary-foreground">
              Atendemos a cidade inteira
            </h2>
            <p className="mt-2 text-sm opacity-90">
              Bairros com maior volume de chamadas hoje em São Paulo.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {spSubprefeituras.map((b) => (
                <span
                  key={b}
                  className="rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-medium"
                >
                  {b}
                </span>
              ))}
            </div>
            <Button asChild variant="secondary" className="mt-7 rounded-full">
              <Link to="/auth">Criar minha conta</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
