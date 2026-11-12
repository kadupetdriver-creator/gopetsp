import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Car,
  ChevronRight,
  Loader2,
  Pause,
  PawPrint,
  Play,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import openingVideo from "@/assets/gopet-pwa-opening.mp4.asset.json";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/hooks/useRoleGuard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GoPet — Transporte de pets em São Paulo" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
    search: { papel: "motorista" as const, next: "/seja-motorista" },
    icon: Sparkles,
    title: "Quero ser Motorista",
    text: "Envie seus documentos e vire parceiro GoPet.",
    tone: "bg-card text-foreground ring-1 ring-border hover:bg-secondary",
    iconTone: "bg-primary/15 text-primary-ink",
  },
];

const OPENING_VIDEO_STORAGE_KEY = "gopet-opening-video-seen";

function Splash() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showOpening, setShowOpening] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);

  // Sessão ativa: pula a escolha e vai direto para a tela do papel atual.
  useEffect(() => {
    if (!loading && user && profile) {
      void navigate({ to: homeForRole(profile), replace: true });
    }
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(OPENING_VIDEO_STORAGE_KEY) === "1") {
        setShowOpening(false);
      }
    } catch {
      // A apresentação continua disponível quando o navegador bloqueia o armazenamento.
    }
  }, []);

  useEffect(() => {
    if (!showOpening) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showOpening]);

  const dismissOpening = () => {
    try {
      window.sessionStorage.setItem(OPENING_VIDEO_STORAGE_KEY, "1");
    } catch {
      // O acesso ao app não depende do armazenamento do navegador.
    }
    setShowOpening(false);
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  };

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (!video.muted && video.paused) {
      void video.play().catch(() => setIsPlaying(false));
    }
  };

  const deciding = loading || (!!user && !profile) || (!!user && !!profile);

  return (
    <>
      {showOpening && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Apresentação GoPet"
          className="fixed inset-0 z-[100] bg-accent text-accent-foreground"
        >
          <video
            ref={videoRef}
            className="size-full object-contain"
            autoPlay
            muted
            playsInline
            preload="auto"
            poster="/gopet-opening.png"
            aria-label="Vídeo de apresentação da GoPet"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={dismissOpening}
            onError={dismissOpening}
          >
            <source src={openingVideo.url} type="video/mp4" />
          </video>

          <button
            type="button"
            onClick={toggleSound}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-foreground/10 px-4 text-sm font-semibold text-accent-foreground ring-1 ring-accent-foreground/20 transition-colors hover:bg-accent-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            {isMuted ? "Ativar som" : "Desativar som"}
          </button>

          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={togglePlayback}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent-foreground/10 px-5 text-sm font-semibold text-accent-foreground ring-1 ring-accent-foreground/20 transition-colors hover:bg-accent-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
              {isPlaying ? "Pausar vídeo" : "Continuar vídeo"}
            </button>
            <button
              type="button"
              onClick={dismissOpening}
              autoFocus
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
              Entrar no app
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <img
        src="/gopet-opening.png"
        alt="GoPet — Seu pet em boas patas!"
        width={1024}
        height={936}
        className="h-auto w-64 max-w-full shrink-0 object-contain"
        loading="eager"
        fetchPriority="high"
      />
      <h1 className="mt-6 text-center text-3xl font-semibold leading-tight">
        Go<span className="text-primary-ink">Pet</span>
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Transporte de pets com carinho em São Paulo e região metropolitana.
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
