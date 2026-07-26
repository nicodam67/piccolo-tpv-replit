import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { APP_VERSION } from '../lib/app-version';

type PwaProfile = 'waiter' | 'kds' | 'fichaje';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function profileFor(pathname: string): PwaProfile {
  if (pathname.startsWith('/kds/')) return 'kds';
  if (pathname.startsWith('/fichaje/tablet')) return 'fichaje';
  return 'waiter';
}

const PROFILE_COPY: Record<PwaProfile, { name: string; color: string }> = {
  waiter: { name: 'Piccolo TPV', color: '#f59e0b' },
  kds: { name: 'Piccolo KDS', color: '#06b6d4' },
  fichaje: { name: 'Piccolo Fichaje', color: '#0f766e' },
};

export default function PwaLifecycle() {
  const [location] = useLocation();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const profile = profileFor(location);
  const copy = PROFILE_COPY[profile];

  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) manifest.href = `${import.meta.env.BASE_URL}${profile}.webmanifest`;
    document.title = `${copy.name} ${APP_VERSION}`;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme) theme.content = copy.color;
  }, [copy.color, copy.name, profile]);

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    let active = true;
    let timer: number | null = null;
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL, updateViaCache: 'none' },
    ).then((registration) => {
      if (!active) return;
      if (registration.waiting) setWaitingWorker(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(registration.waiting);
          }
        });
      });
      timer = window.setInterval(() => void registration.update(), 60 * 60_000);
    });
    const reload = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', reload);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  };

  const update = () => {
    const approved = window.confirm(
      'Confirma que no hay un servicio activo. Se recargará Piccolo para aplicar la versión revisada.',
    );
    if (approved) waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  };

  if ((!installPrompt && !waitingWorker) || dismissed) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border border-cyan-500/40 bg-slate-950 p-4 text-white shadow-2xl">
      <button className="absolute right-2 top-2 text-slate-400" onClick={() => setDismissed(true)} aria-label="Cerrar"><X size={16} /></button>
      <p className="pr-6 text-sm font-bold">{waitingWorker ? 'Nueva versión revisada disponible' : `Instalar ${copy.name}`}</p>
      <p className="mt-1 text-xs text-slate-300">
        {waitingWorker
          ? 'Solo se aplicará con aprobación y cuando no haya servicio activo.'
          : 'Añade un icono y abre Piccolo como aplicación independiente.'}
      </p>
      <button
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold hover:bg-cyan-500"
        onClick={waitingWorker ? update : install}
      >
        {waitingWorker ? <RefreshCw size={14} /> : <Download size={14} />}
        {waitingWorker ? 'Revisar y actualizar' : 'Instalar aplicación'}
      </button>
    </div>
  );
}
