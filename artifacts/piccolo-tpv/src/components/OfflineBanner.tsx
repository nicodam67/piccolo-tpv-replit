/**
 * OfflineBanner — shows connectivity status and pending ops at the top of the UI
 */
import { WifiOff, Wifi, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function OfflineBanner() {
  const { isOnline, isServerReachable, pendingOps, isSyncing, triggerSync, lastChecked } = useNetworkStatus();

  // All good — no banner
  if (isOnline && isServerReachable && pendingOps === 0) return null;

  const isFullyOffline = !isOnline;
  const isDegraded = isOnline && !isServerReachable;
  const hasPending = pendingOps > 0;

  let bg = 'bg-yellow-950/90 border-yellow-700/60';
  let icon = <AlertTriangle size={15} className="text-yellow-400 shrink-0" />;
  let label = 'Conectividad degradada — servidor no responde';

  if (isFullyOffline) {
    bg = 'bg-red-950/90 border-red-700/60';
    icon = <WifiOff size={15} className="text-red-400 shrink-0" />;
    label = 'Sin conexión a Internet — modo sin conexión activo';
  } else if (!isDegraded && hasPending) {
    bg = 'bg-blue-950/90 border-blue-700/60';
    icon = <Wifi size={15} className="text-blue-400 shrink-0" />;
    label = `${pendingOps} operación${pendingOps !== 1 ? 'es' : ''} pendiente${pendingOps !== 1 ? 's' : ''} de sincronizar`;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between px-4 py-2 border-b backdrop-blur-sm text-xs font-semibold ${bg}`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-foreground/90">{label}</span>
        {lastChecked && (
          <span className="text-muted-foreground hidden sm:inline">
            · Última comprobación: {lastChecked.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasPending && isServerReachable && (
          <button
            onClick={() => void triggerSync()}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/80 text-primary-foreground hover:bg-primary transition-colors disabled:opacity-50 text-[11px] font-bold"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        )}
        {!isOnline && (
          <span className="text-red-400/80 text-[11px]">
            Los pagos online no están disponibles
          </span>
        )}
      </div>
    </div>
  );
}

export default OfflineBanner;
