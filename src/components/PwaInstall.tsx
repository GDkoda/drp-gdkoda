import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Download, ExternalLink, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AionEmblem } from "@/components/aion-emblem";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallChoice> };
type PwaInstallContextValue = {
  isMobile: boolean;
  isIOS: boolean;
  installed: boolean;
  canPrompt: boolean;
  install: () => Promise<void>;
  showInstructions: () => void;
};
const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);
const DISMISSED_KEY = "mesa-pwa-install-dismissed-v1";

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isPhone() {
  const ua = navigator.userAgent;
  return /Android.*Mobile|iPhone|iPod|Windows Phone/i.test(ua) ||
    (window.matchMedia("(max-width: 767px)").matches && navigator.maxTouchPoints > 0);
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [showManualInstructions, setShowManualInstructions] = useState(false);

  useEffect(() => {
    const mobile = isPhone();
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const alreadyInstalled = isStandaloneMode();
    setIsMobile(mobile);
    setIsIOS(ios);
    setInstalled(alreadyInstalled);

    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.info("Registro do modo instalável indisponível neste ambiente.", error);
      });
    }

    let timer: number | undefined;
    if (mobile && !alreadyInstalled) {
      let dismissed = false;
      try { dismissed = localStorage.getItem(DISMISSED_KEY) === "1"; } catch { /* armazenamento opcional */ }
      if (!dismissed) timer = window.setTimeout(() => setShowIntro(true), 650);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIntro(false);
      try { localStorage.removeItem(DISMISSED_KEY); } catch { /* armazenamento opcional */ }
    };
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => setInstalled(isStandaloneMode());

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener?.("change", onDisplayModeChange);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    setShowManualInstructions(false);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* armazenamento opcional */ }
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      setShowIntro(true);
      setShowManualInstructions(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setShowIntro(false);
      }
    } catch {
      setShowManualInstructions(true);
    }
  }, [deferredPrompt]);

  const showInstructions = useCallback(() => {
    setShowManualInstructions(true);
    setShowIntro(true);
  }, []);
  useEffect(() => {
    if (!showIntro) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissIntro();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showIntro, dismissIntro]);


  const value = useMemo(() => ({
    isMobile, isIOS, installed, canPrompt: !!deferredPrompt, install, showInstructions,
  }), [isMobile, isIOS, installed, deferredPrompt, install, showInstructions]);

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      {isMobile && showIntro && !installed && (
        <div className="pwa-install-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismissIntro();
        }}>
          <section className="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
            <button type="button" className="pwa-install-close" aria-label="Fechar convite de instalação" onClick={dismissIntro}><X className="h-4 w-4" /></button>
            <div className="pwa-install-emblem"><AionEmblem className="h-9 w-9 text-primary" /></div>
            <p className="pwa-install-eyebrow">Sua mesa, sempre à mão</p>
            <h2 id="pwa-install-title">Leve a Taverna para o celular</h2>
            <p className="pwa-install-copy">Adicione a Mesa 3D&T à tela inicial e abra como um aplicativo, sem precisar procurar a página no navegador.</p>
            {showManualInstructions && (
              <div className="pwa-install-steps">
                {isIOS ? (
                  <>
                    <p><Share className="h-4 w-4" /> <strong>1.</strong> Toque em Compartilhar no Safari (ou no menu do navegador).</p>
                    <p><span className="pwa-step-number">2</span> Escolha <strong>Adicionar à Tela de Início</strong>.</p>
                    <p><span className="pwa-step-number">3</span> Confirme em <strong>Adicionar</strong>.</p>
                  </>
                ) : (
                  <>
                    <p><span className="pwa-step-number">1</span> Abra o menu do navegador (⋮).</p>
                    <p><span className="pwa-step-number">2</span> Toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
                    <p><span className="pwa-step-number">3</span> Confirme a instalação.</p>
                  </>
                )}
              </div>
            )}
            <div className="pwa-install-actions">
              {!showManualInstructions && (
                <Button className="w-full" onClick={() => void install()}>
                  {deferredPrompt ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                  {deferredPrompt ? "Instalar aplicativo" : "Ver como instalar"}
                </Button>
              )}
              {showManualInstructions && !deferredPrompt && (
                <Button className="w-full" onClick={dismissIntro}><Check className="h-4 w-4" /> Entendi</Button>
              )}
              {showManualInstructions && deferredPrompt && (
                <Button className="w-full" onClick={() => void install()}><Download className="h-4 w-4" /> Instalar aplicativo</Button>
              )}
              <button type="button" className="pwa-install-later" onClick={dismissIntro}>Agora não, continuar no navegador</button>
            </div>
          </section>
        </div>
      )}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error("PwaInstallProvider ausente");
  return value;
}

export function PwaInstallCard() {
  const { isMobile, installed, canPrompt, install, showInstructions } = usePwaInstall();
  if (!isMobile) return null;

  return (
    <section className="pwa-install-card" aria-live="polite">
      <div className="pwa-install-card-icon">{installed ? <Check className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{installed ? "Aplicativo já instalado" : "Instale a Mesa 3D&T"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{installed ? "Tudo pronto. Abra a mesa pelo ícone na tela inicial do celular." : "Acesso rápido, com aparência de aplicativo e um atalho na tela inicial."}</p>
      </div>
      {installed ? (
        <span className="pwa-installed-label"><Check className="h-3.5 w-3.5" /> Instalado</span>
      ) : (
        <Button size="sm" className="shrink-0" onClick={() => canPrompt ? void install() : showInstructions()}>
          {canPrompt ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
          {canPrompt ? "Instalar" : "Como instalar"}
        </Button>
      )}
    </section>
  );
}
