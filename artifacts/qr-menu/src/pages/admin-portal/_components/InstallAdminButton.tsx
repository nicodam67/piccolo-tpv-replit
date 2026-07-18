import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Download, Share } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";

// Minimal type for the browser's install prompt event (not in standard TS lib)
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Lets an admin install the admin panel as an app on their phone/desktop.
 * Swaps the page manifest to the admin-scoped manifest so the installed
 * shortcut opens directly to /admin.
 */
export default function InstallAdminButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  // Point the manifest at the admin-scoped manifest while on this page
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previous = link?.getAttribute("href") ?? null;
    if (link) link.setAttribute("href", "/admin.webmanifest");
    return () => {
      if (link && previous) link.setAttribute("href", previous);
    };
  }, []);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (isIos()) {
      setIosOpen(true);
      return;
    }
    if (!deferredPrompt) {
      setIosOpen(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (installed) return null;

  return (
    <>
      <Button
        variant="secondary"
        onClick={handleInstall}
        className="cursor-pointer gap-2"
      >
        <Download className="w-4 h-4" />
        Instalar en el móvil
      </Button>

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir a la pantalla de inicio</DialogTitle>
            <DialogDescription>
              Para instalar el panel en tu teléfono, sigue estos pasos en el navegador.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex items-center gap-2">
              <Share className="w-4 h-4 text-primary shrink-0" />
              <span>1. Pulsa el botón Compartir del navegador.</span>
            </li>
            <li className="flex items-center gap-2">
              <Download className="w-4 h-4 text-primary shrink-0" />
              <span>2. Elige "Añadir a pantalla de inicio".</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-4 h-4 shrink-0" />
              <span>3. Confirma y el icono aparecerá en tu móvil.</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
