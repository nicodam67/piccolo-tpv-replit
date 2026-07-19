import { useEffect, useState, useCallback } from "react";
import { X, Share, Download } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useTranslation } from "react-i18next";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isSafari(): boolean {
  return /safari/i.test(window.navigator.userAgent) && !/chrome/i.test(window.navigator.userAgent);
}

const DISMISSED_KEY = "install_banner_dismissed";

export default function InstallBanner() {
  const { t } = useTranslation("common");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    if (isIos() && isSafari()) {
      setVisible(true);
      setShowIosInstructions(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-md shadow-xl px-4 py-3 flex items-start gap-3">
        <img
          src="/icon/icon-192.png"
          alt="Piccolo"
          className="w-10 h-10 rounded-xl shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">
            Piccolo la Ràpita
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {showIosInstructions
              ? t("install.ios_instructions")
              : t("install.add_to_home")}
          </p>
          {showIosInstructions ? (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <Share className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span>{t("install.ios_share")}</span>
              <span>→</span>
              <span>{t("install.ios_add")}</span>
            </div>
          ) : (
            <Button
              size="sm"
              className="mt-2 h-7 text-xs px-3 cursor-pointer gap-1.5"
              onClick={handleInstall}
            >
              <Download className="w-3 h-3" />
              {t("install.install_btn")}
            </Button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-full hover:bg-muted transition-colors cursor-pointer text-muted-foreground"
          aria-label={t("modal.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
