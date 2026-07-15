import { useLocation } from 'wouter';
import { ChevronLeft, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, Coins, Settings2, RefreshCw } from 'lucide-react';
import {
  useGetCashMachineStatus,
  useGetCashMachineConfig,
  useGetCashMachineCashLevels,
} from '@workspace/api-client-react';

function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    connected:    { label: 'Conectado',     cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    disconnected: { label: 'Desconectado',  cls: 'bg-destructive/20 text-destructive border-destructive/30' },
    busy:         { label: 'Ocupado',       cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    error:        { label: 'Error',         cls: 'bg-destructive/20 text-destructive border-destructive/30' },
    maintenance:  { label: 'Mantenimiento', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-secondary text-muted-foreground border-border' };
  return (
    <span className={`px-3 py-1 rounded-full border text-xs font-black uppercase tracking-wider ${cls}`}>{label}</span>
  );
}

export default function CajaAutomaticaEstado() {
  const [, setLocation] = useLocation();

  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useGetCashMachineStatus({
    query: { queryKey: ['/api/admin/cash-machine/status'] as const, refetchInterval: 10000 },
  });

  const { data: cfg } = useGetCashMachineConfig({
    query: { queryKey: ['/api/admin/cash-machine/config'] as const },
  });

  const { data: levels, isLoading: loadingLevels } = useGetCashMachineCashLevels({
    query: {
      queryKey: ['/api/admin/cash-machine/cash-levels'] as const,
      enabled: (status as any)?.supportsCashLevels === true,
    },
  });

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = status as any;
  const c = cfg as any;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/admin')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-2">
            <Coins size={20} className="text-primary" />
            <h1 className="text-xl font-bold">Estado — Caja automática</h1>
          </div>
        </div>
        <button onClick={() => refetchStatus()}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
          <RefreshCw size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-xl mx-auto space-y-5">

          {/* Device card */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-lg">{c?.model ?? 'Caja automática'}</h2>
                <p className="text-sm text-muted-foreground">{c?.manufacturer} · {c?.deviceId}</p>
              </div>
              {s && <StatusBadge status={s.status} />}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-secondary/30 rounded-xl p-3">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Dirección</p>
                <p className="font-mono font-semibold">{c?.host}:{c?.port}</p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-3">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Tipo</p>
                <p className="font-mono font-semibold uppercase">{c?.connectionType}</p>
              </div>
            </div>
            {s?.lastSeen && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock size={14} />
                <span>Última respuesta: <span className="font-semibold text-foreground">{fmtDate(s.lastSeen)}</span></span>
              </div>
            )}
          </div>

          {/* Alerts */}
          {s && (
            <div className="space-y-3">
              {s.jamDetected && (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
                  <AlertTriangle size={20} className="text-destructive shrink-0" />
                  <div>
                    <p className="font-black text-sm text-destructive">Atasco detectado</p>
                    <p className="text-xs text-muted-foreground">Abrir la máquina y liberar el atasco manualmente.</p>
                  </div>
                </div>
              )}
              {s.doorOpen && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                  <AlertTriangle size={20} className="text-amber-400 shrink-0" />
                  <div>
                    <p className="font-black text-sm text-amber-400">Puerta abierta</p>
                    <p className="text-xs text-muted-foreground">Cierra la puerta del cajón para operar.</p>
                  </div>
                </div>
              )}
              {s.maintenanceRequired && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                  <Settings2 size={20} className="text-amber-400 shrink-0" />
                  <div>
                    <p className="font-black text-sm text-amber-400">Mantenimiento requerido</p>
                    <p className="text-xs text-muted-foreground">Contactar con el servicio técnico.</p>
                  </div>
                </div>
              )}
              {!s.jamDetected && !s.doorOpen && !s.maintenanceRequired && s.status === 'connected' && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-2xl">
                  <CheckCircle2 size={20} className="text-green-400 shrink-0" />
                  <p className="font-black text-sm text-green-400">Dispositivo operativo — sin alertas</p>
                </div>
              )}
              {s.status === 'disconnected' && (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
                  <XCircle size={20} className="text-destructive shrink-0" />
                  <div>
                    <p className="font-black text-sm text-destructive">Sin conexión</p>
                    <p className="text-xs text-muted-foreground">Comprueba el cable, la IP y que el dispositivo esté encendido.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cash levels */}
          {s?.supportsCashLevels && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Niveles de efectivo</h3>
              {loadingLevels ? (
                <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : !levels || (levels as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No disponible</p>
              ) : (
                <div className="space-y-2">
                  {(levels as any[]).map((l, i) => (
                    <div key={i} className={`flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0 ${l.isLow ? 'text-amber-400' : ''}`}>
                      <span className="font-mono font-semibold">
                        {l.denomination >= 1 ? `${l.denomination}€` : `${Math.round(l.denomination * 100)}¢`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{l.count} uds</span>
                        {l.isLow && <AlertTriangle size={14} className="text-amber-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Config shortcut */}
          <button onClick={() => setLocation('/admin/caja-automatica')}
            className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl text-sm font-semibold hover:bg-secondary/40 transition-colors">
            <div className="flex items-center gap-3">
              <Settings2 size={18} className="text-muted-foreground" />
              <span>Ir a configuración</span>
            </div>
            <ChevronLeft size={16} className="text-muted-foreground rotate-180" />
          </button>

        </div>
      </div>
    </div>
  );
}
