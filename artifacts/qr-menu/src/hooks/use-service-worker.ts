import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useServiceWorker() {
  const toastShown = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In Vite dev mode, unregister ALL service workers so stale caches never
    // intercept hot-reloaded modules (which causes MIME-type errors).
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) reg.unregister();
      });
      return;
    }

    // Purge every SW that is not scoped to this app's base path.
    // This clears the stale root-scoped SW ("/") that was incorrectly
    // registered in a previous version and corrupts module-script loading.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        const appBase = import.meta.env.BASE_URL; // "/qr-menu/"
        if (!reg.scope.endsWith(appBase) && !reg.scope.includes(appBase)) {
          console.log("[SW] Unregistering stale scope:", reg.scope);
          reg.unregister();
        }
      }
    });

    const showUpdateToast = () => {
      if (toastShown.current) return;
      toastShown.current = true;
      toast("A new version is available!", {
        duration: Infinity,
        action: { label: "Refresh", onClick: () => window.location.reload() },
      });
    };

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        console.log("Service Worker registered:", registration);

        if (registration.waiting) {
          showUpdateToast();
          return;
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
      })
      .catch((err) => console.log("Service Worker registration failed:", err));
  }, []);
}
