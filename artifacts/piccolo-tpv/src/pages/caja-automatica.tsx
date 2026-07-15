import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, Save, Loader2, CheckCircle2, XCircle, Zap, Eye, EyeOff, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetCashMachineConfig,
  useUpdateCashMachineConfig,
  useTestCashMachineConnection,
} from '@workspace/api-client-react';

function fmt(n: number | undefined | null) { return n ?? 0; }

const CONNECTION_TYPES = ['tcp', 'http', 'serial'];
const MANUFACTURERS = ['simulator', 'cashdro', 'cashkeeper', 'glory', 'jofemar', 'other'];

export default function CajaAutomatica() {
  const [, setLocation] = useLocation();
  const { data: cfg, isLoading, refetch } = useGetCashMachineConfig({
    query: { queryKey: ['/api/admin/cash-machine/config'] as const },
  });

  const updateConfig = useUpdateCashMachineConfig();
  const testConnection = useTestCashMachineConnection();

  const [form, setForm] = useState({
    manufacturer: 'simulator',
    model: 'Simulator v1',
    host: 'localhost',
    port: '8080',
    connectionType: 'tcp',
    deviceId: 'device-1',
    credentialKey: '',
    timeoutMs: '30000',
    enabled: false,
  });
  const [showCredential, setShowCredential] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cfg) {
      setForm({
        manufacturer: (cfg as any).manufacturer ?? 'simulator',
        model: (cfg as any).model ?? 'Simulator v1',
        host: (cfg as any).host ?? 'localhost',
        port: String((cfg as any).port ?? 8080),
        connectionType: (cfg as any).connectionType ?? 'tcp',
        deviceId: (cfg as any).deviceId ?? 'device-1',
        credentialKey: '',
        timeoutMs: String((cfg as any).timeoutMs ?? 30000),
        enabled: (cfg as any).enabled ?? false,
      });
    }
  }, [cfg]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        data: {
          manufacturer: form.manufacturer,
          model: form.model,
          host: form.host,
          port: parseInt(form.port),
          connectionType: form.connectionType,
          deviceId: form.deviceId,
          ...(form.credentialKey ? { credentialKey: form.credentialKey } : {}),
          timeoutMs: parseInt(form.timeoutMs),
          enabled: form.enabled,
        },
      });
      toast.success('Configuración guardada');
      refetch();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection.mutateAsync({ data: {} });
      setTestResult({ ok: true, latencyMs: (res as any).latencyMs });
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.error ?? 'Sin respuesta' });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCredentialSet = (cfg as any)?.hasCredential;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/admin')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-2">
            <Settings2 size={20} className="text-primary" />
            <h1 className="text-xl font-bold">Caja automática</h1>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-black rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Enable toggle */}
          <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
            <div>
              <h3 className="font-black text-base">Módulo activo</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Activar para ofrecer pago por caja automática</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`relative w-14 h-7 rounded-full transition-colors ${form.enabled ? 'bg-primary' : 'bg-secondary'}`}>
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${form.enabled ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Device identity */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h3 className="font-black text-base uppercase tracking-widest text-muted-foreground text-sm">Dispositivo</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Fabricante</label>
                <select
                  value={form.manufacturer}
                  onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-primary transition-colors">
                  {MANUFACTURERS.map(m => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Modelo</label>
                <input
                  type="text" value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">ID de dispositivo</label>
              <input
                type="text" value={form.deviceId}
                onChange={e => setForm(f => ({ ...f, deviceId: e.target.value }))}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Connection */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h3 className="font-black text-base uppercase tracking-widest text-muted-foreground text-sm">Conexión</h3>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Host / IP</label>
                <input
                  type="text" value={form.host}
                  onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Puerto</label>
                <input
                  type="number" value={form.port}
                  onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Tipo de conexión</label>
                <select
                  value={form.connectionType}
                  onChange={e => setForm(f => ({ ...f, connectionType: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-primary transition-colors">
                  {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Timeout (ms)</label>
                <input
                  type="number" value={form.timeoutMs}
                  onChange={e => setForm(f => ({ ...f, timeoutMs: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h3 className="font-black text-base uppercase tracking-widest text-muted-foreground text-sm">Credenciales</h3>
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">
                Clave de acceso {hasCredentialSet && !form.credentialKey && (
                  <span className="ml-2 text-green-400 font-normal normal-case">● Guardada</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showCredential ? 'text' : 'password'}
                  value={form.credentialKey}
                  onChange={e => setForm(f => ({ ...f, credentialKey: e.target.value }))}
                  placeholder={hasCredentialSet ? '●●●●●●●● (no cambiar)' : 'Introduce la clave del dispositivo'}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCredential(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showCredential ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                La clave se almacena como referencia de variable de entorno, nunca en texto plano.
              </p>
            </div>
          </div>

          {/* Test connection */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-base">Probar conexión</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Comprueba que el dispositivo responde</p>
              </div>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground font-black rounded-xl text-sm hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors">
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                Probar
              </button>
            </div>
            {testResult && (
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${testResult.ok ? 'bg-green-500/10 border-green-500/30' : 'bg-destructive/10 border-destructive/30'}`}>
                {testResult.ok
                  ? <CheckCircle2 size={20} className="text-green-400 shrink-0" />
                  : <XCircle size={20} className="text-destructive shrink-0" />
                }
                <div>
                  <p className={`font-black text-sm ${testResult.ok ? 'text-green-400' : 'text-destructive'}`}>
                    {testResult.ok ? `Conectado — ${testResult.latencyMs}ms` : 'Sin conexión'}
                  </p>
                  {testResult.error && <p className="text-xs text-muted-foreground mt-0.5">{testResult.error}</p>}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
