import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, MoreVertical, Share } from "lucide-react";
import { goPetLogoUrl } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  detectInstallPlatform,
  INSTALL_DISMISS_STORAGE_KEY,
  shouldShowInstallInvite,
  type InstallPlatform,
} from "@/lib/pwa-install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

type InstallAppContextValue = {
  installed: boolean;
  openInstallPrompt: () => void;
};

const InstallAppContext = createContext<InstallAppContextValue | undefined>(undefined);

function rememberDismissal() {
  try {
    window.localStorage.setItem(INSTALL_DISMISS_STORAGE_KEY, String(Date.now()));
  } catch {
    // A instalação continua disponível quando o navegador bloqueia o armazenamento local.
  }
}

export function InstallAppProvider({ children }: { children: ReactNode }) {
  const { loading, needsProfileCompletion } = useAuth();
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("other");

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => {
      const isInstalled = displayMode.matches || (window.navigator as NavigatorWithStandalone).standalone === true;
      setInstalled(isInstalled);
      if (isInstalled) setOpen(false);
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
    };
    const onAppInstalled = () => {
      deferredPrompt.current = null;
      setInstalled(true);
      setOpen(false);
      setInstalling(false);
      try {
        window.localStorage.removeItem(INSTALL_DISMISS_STORAGE_KEY);
      } catch {
        // Nenhuma ação adicional é necessária sem acesso ao armazenamento local.
      }
    };

    setPlatform(detectInstallPlatform(window.navigator.userAgent));
    updateInstalled();
    setReady(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    displayMode.addEventListener("change", updateInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      displayMode.removeEventListener("change", updateInstalled);
    };
  }, []);

  useEffect(() => {
    if (!ready || loading || needsProfileCompletion || open) return;

    let dismissedAt: string | null = null;
    try {
      dismissedAt = window.localStorage.getItem(INSTALL_DISMISS_STORAGE_KEY);
    } catch {
      // Sem armazenamento local, o convite pode ser exibido novamente em outro acesso.
    }

    if (shouldShowInstallInvite({ installed, dismissedAt, now: Date.now() })) {
      setShowInstructions(false);
      setOpen(true);
    }
  }, [installed, loading, needsProfileCompletion, open, ready]);

  const dismiss = useCallback(() => {
    rememberDismissal();
    setOpen(false);
    setShowInstructions(false);
  }, []);

  const openInstallPrompt = useCallback(() => {
    if (installed) return;
    setShowInstructions(false);
    setOpen(true);
  }, [installed]);

  const install = async () => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) {
      setShowInstructions(true);
      return;
    }

    setInstalling(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredPrompt.current = null;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setOpen(false);
      } else {
        rememberDismissal();
        setOpen(false);
      }
    } catch {
      deferredPrompt.current = null;
      setShowInstructions(true);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <InstallAppContext.Provider value={{ installed, openInstallPrompt }}>
      {children}
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) dismiss(); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl border-primary/40 bg-accent p-0 text-accent-foreground shadow-soft">
          <div className="flex flex-col items-center gap-5 px-6 py-8 text-center">
            <img
              src={goPetLogoUrl}
              alt="Logotipo oficial da GoPet SP"
              width={112}
              height={112}
              className="size-28 object-contain"
            />
            <DialogHeader className="items-center gap-2 text-center">
              <DialogTitle className="font-display text-2xl text-primary">GoPet SP sempre com você</DialogTitle>
              <DialogDescription className="text-base leading-relaxed text-accent-foreground/85">
                Instale o aplicativo GoPet SP e tenha nossos serviços sempre à mão!
              </DialogDescription>
            </DialogHeader>

            {showInstructions ? (
              <div id="pwa-install-instructions" className="w-full rounded-2xl border border-primary/30 bg-background/5 p-4 text-left text-sm leading-relaxed text-accent-foreground/90">
                {platform === "ios" ? (
                  <>
                    <p className="mb-2 font-semibold text-primary">Como instalar no iPhone</p>
                    <ol className="list-decimal space-y-2 pl-5">
                      <li>Abra este site no <strong>Safari</strong>.</li>
                      <li>Toque em <strong>Compartilhar</strong> <Share className="inline size-4 align-[-0.15em]" aria-label="Compartilhar" />.</li>
                      <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.</li>
                    </ol>
                  </>
                ) : platform === "android" ? (
                  <>
                    <p className="mb-2 font-semibold text-primary">Como instalar pelo Chrome</p>
                    <ol className="list-decimal space-y-2 pl-5">
                      <li>Toque nos <strong>três pontinhos</strong> <MoreVertical className="inline size-4 align-[-0.15em]" aria-label="Menu do Chrome" /> do Chrome.</li>
                      <li>Escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <p className="mb-2 font-semibold text-primary">Como instalar pelo navegador</p>
                    <p>Abra o menu do navegador e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>. No iPhone, essa opção fica no menu Compartilhar do Safari.</p>
                  </>
                )}
              </div>
            ) : null}

            <DialogFooter className="mt-1 flex w-full flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button
                size="lg"
                className="w-full rounded-full"
                disabled={installing}
                onClick={() => void install()}
                aria-expanded={showInstructions}
                aria-controls="pwa-install-instructions"
              >
                <Download className="size-5" />
                {installing ? "Abrindo instalação..." : "Instalar aplicativo"}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full rounded-full text-accent-foreground hover:bg-primary/10 hover:text-primary"
                onClick={dismiss}
              >
                Agora não
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </InstallAppContext.Provider>
  );
}

export function useInstallApp() {
  const context = useContext(InstallAppContext);
  if (!context) throw new Error("useInstallApp deve ser usado dentro de InstallAppProvider");
  return context;
}
