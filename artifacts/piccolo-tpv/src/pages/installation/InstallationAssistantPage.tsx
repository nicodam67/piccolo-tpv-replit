import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CircleAlert, Download,
  ExternalLink, HardDrive, Loader2, Network, Printer, RefreshCw,
  Server, ShieldCheck, Smartphone, Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { useAuth } from '../../providers/AuthProvider';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Textarea } from '../../components/ui/textarea';

type StepStatus = 'ready' | 'warning' | 'pending' | 'error';
type CertificationStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'not_applicable';

interface AssistantStep {
  id: string;
  label: string;
  status: StepStatus;
  configured: string[];
  missing: string[];
  errors: string[];
  corrections: string[];
  href: string;
  detection: string;
}

interface CertificationCase {
  caseId: string;
  area: string;
  deviceRef: string;
  requiredHardware: string;
  preparation: string;
  steps: string[];
  expected: string;
  status: CertificationStatus;
  notes: string;
  performedBy: string | null;
  performedAt: string | null;
}

interface AssistantSnapshot {
  generatedAt: string;
  version: string;
  configuration: {
    restaurantName: string;
    setupCompleted: boolean;
    printMode: string;
    departmentCount: number;
  };
  steps: AssistantStep[];
  diagnostics: {
    database: { status: StepStatus; latencyMs: number; detection: string };
    printers: { configured: number; offline: number; detection: string };
    kds: { configured: number; recent: number };
    tablets: { inventoried: number; connected: number };
    storage: { configured: number; types: string[] };
    network: { entries: number; errors: number; unknown: number };
    backups: { schedules: number; recentVerified: boolean };
    measuredAt: string;
    refreshAfterMs: number;
  };
  certification: {
    catalogStatus: string;
    cases: CertificationCase[];
    summary: {
      total: number;
      counts: Record<CertificationStatus, number>;
      status: string;
    };
  };
  incidents: Array<{ level: string; module: string; message: string; createdAt: string }>;
}

const STEP_ICONS: Record<string, typeof Server> = {
  main_computer: Server,
  printers: Printer,
  kds: Utensils,
  tablets: Smartphone,
  storage: HardDrive,
  network: Network,
  backups: ShieldCheck,
};

const STATUS_LABELS: Record<CertificationStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  passed: 'Superada',
  failed: 'Fallida',
  not_applicable: 'No aplicable',
};

const STATUS_STYLE: Record<StepStatus | CertificationStatus, string> = {
  ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  passed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  not_applicable: 'bg-blue-100 text-blue-800 border-blue-200',
};

function StatusBadge({ status, label }: { status: keyof typeof STATUS_STYLE; label?: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {label ?? status}
    </span>
  );
}

export default function InstallationAssistantPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'assistant' | 'checklist' | 'diagnostics'>('assistant');
  const [area, setArea] = useState('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingCase, setPendingCase] = useState<string | null>(null);

  const snapshot = useQuery<AssistantSnapshot>({
    queryKey: ['installation-assistant'],
    queryFn: () => api.get('/api/admin/installation/assistant'),
    refetchInterval: 10_000,
  });

  const updateCase = useMutation({
    mutationFn: ({ item, status }: { item: CertificationCase; status: CertificationStatus }) =>
      api.post(`/api/admin/installation/certification/${item.caseId}`, {
        status,
        notes: notes[item.caseId] ?? item.notes,
        deviceName: item.deviceRef,
      }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onMutate: ({ item }) => setPendingCase(item.caseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['installation-assistant'] });
      toast.success('Estado de certificación registrado');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo registrar'),
    onSettled: () => setPendingCase(null),
  });

  const filteredCases = useMemo(() => {
    const cases = snapshot.data?.certification.cases ?? [];
    return area === 'all' ? cases : cases.filter((entry) => entry.area === area);
  }, [area, snapshot.data]);

  const printPdf = () => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    window.open(`${base}/api/admin/installation/certification/export?format=html&print=1`, '_blank', 'noopener');
  };

  if (snapshot.isLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-cyan-600" /></div>;
  }
  if (snapshot.isError || !snapshot.data) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="max-w-md"><CardContent className="p-6 text-center">
          <CircleAlert className="mx-auto mb-3 text-red-600" />
          <p className="font-semibold">No se pudo cargar el asistente</p>
          <Button className="mt-4" onClick={() => snapshot.refetch()}>Reintentar</Button>
        </CardContent></Card>
      </div>
    );
  }

  const data = snapshot.data;
  const readySteps = data.steps.filter((step) => step.status === 'ready').length;
  const areas = ['all', ...new Set(data.certification.cases.map((entry) => entry.area))];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/hardware')} aria-label="Volver">
            <ArrowLeft size={19} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">Asistente de instalación y certificación</h1>
            <p className="text-xs text-slate-500">
              {data.configuration.restaurantName || 'Piccolo TPV'} · versión {data.version} · actualización automática cada 10 s
            </p>
          </div>
          <Button variant="outline" onClick={() => snapshot.refetch()}>
            <RefreshCw size={16} className={snapshot.isFetching ? 'animate-spin' : ''} /> Actualizar
          </Button>
          {user?.role === 'admin' && <Button onClick={printPdf}><Download size={16} /> Exportar PDF</Button>}
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-4">
          {([
            ['assistant', 'Asistente'],
            ['checklist', `Certificación (${data.certification.summary.total})`],
            ['diagnostics', 'Diagnóstico'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Instalación</p><p className="text-2xl font-bold">{readySteps}/{data.steps.length}</p><p className="text-xs text-slate-500">pasos detectados como listos</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Certificación física</p><p className="text-2xl font-bold">{data.certification.summary.counts.passed}/{data.certification.summary.total}</p><p className="text-xs text-slate-500">pruebas superadas por operador</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Incidencias abiertas</p><p className="text-2xl font-bold">{data.incidents.length}</p><p className="text-xs text-slate-500">errores/critical sin resolver</p></CardContent></Card>
        </div>

        {tab === 'assistant' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              El asistente detecta configuración y conectividad disponible. La aprobación física siempre requiere una observación humana.
            </div>
            {data.steps.map((step, index) => {
              const Icon = STEP_ICONS[step.id] ?? Server;
              return (
                <Card key={step.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-50 text-cyan-700"><Icon size={20} /></div>
                      <div className="flex-1"><CardTitle className="text-base">{index + 1}. {step.label}</CardTitle><p className="text-xs text-slate-500">{step.detection}</p></div>
                      <StatusBadge status={step.status} label={{ ready: 'Correcto', warning: 'Revisar', pending: 'Pendiente', error: 'Error' }[step.status]} />
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 pt-2 md:grid-cols-2">
                    <section><h3 className="text-xs font-bold uppercase text-emerald-700">Configurado</h3><ul className="mt-1 space-y-1 text-sm">{(step.configured.length ? step.configured : ['Nada detectado']).map((text) => <li key={text}>• {text}</li>)}</ul></section>
                    <section><h3 className="text-xs font-bold uppercase text-amber-700">Falta</h3><ul className="mt-1 space-y-1 text-sm">{(step.missing.length ? step.missing : ['Nada obligatorio']).map((text) => <li key={text}>• {text}</li>)}</ul></section>
                    {step.errors.length > 0 && <section><h3 className="text-xs font-bold uppercase text-red-700">Errores</h3><ul className="mt-1 space-y-1 text-sm">{step.errors.map((text) => <li key={text}>• {text}</li>)}</ul></section>}
                    <section><h3 className="text-xs font-bold uppercase text-cyan-700">Cómo corregirlo</h3><ul className="mt-1 space-y-1 text-sm">{step.corrections.map((text) => <li key={text}>• {text}</li>)}</ul></section>
                    <div className="md:col-span-2"><Button variant="outline" onClick={() => navigate(step.href)}>Configurar <ExternalLink size={14} /></Button></div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'checklist' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {areas.map((entry) => <Button key={entry} size="sm" variant={area === entry ? 'default' : 'outline'} onClick={() => setArea(entry)}>{entry === 'all' ? 'Todas' : entry}</Button>)}
            </div>
            {filteredCases.map((item) => (
              <Card key={item.caseId}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1"><p className="font-mono text-xs text-cyan-700">{item.caseId}</p><h2 className="font-bold">{item.requiredHardware}</h2><p className="text-sm text-slate-600">{item.expected}</p></div>
                    <StatusBadge status={item.status} label={STATUS_LABELS[item.status]} />
                  </div>
                  <details className="text-sm"><summary className="cursor-pointer font-medium">Preparación y pasos</summary><p className="mt-2">{item.preparation}</p><ol className="list-decimal pl-5">{item.steps.map((text) => <li key={text}>{text}</li>)}</ol></details>
                  <Textarea
                    value={notes[item.caseId] ?? item.notes}
                    onChange={(event) => setNotes((current) => ({ ...current, [item.caseId]: event.target.value }))}
                    placeholder="Observaciones, incidencias y referencia de evidencia (sin secretos ni IPs)"
                    maxLength={2000}
                  />
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS_LABELS) as CertificationStatus[]).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={item.status === status ? 'default' : 'outline'}
                        disabled={pendingCase === item.caseId}
                        onClick={() => updateCase.mutate({ item, status })}
                      >
                        {pendingCase === item.caseId && item.status !== status ? null : STATUS_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    {item.performedBy ? `Último cambio: ${item.performedBy} · ${new Date(item.performedAt!).toLocaleString('es-ES')}` : 'Sin cambios registrados'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === 'diagnostics' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['PostgreSQL', `${data.diagnostics.database.latencyMs} ms`, data.diagnostics.database.detection],
                ['Impresoras', `${data.diagnostics.printers.configured - data.diagnostics.printers.offline}/${data.diagnostics.printers.configured} disponibles`, data.diagnostics.printers.detection],
                ['KDS', `${data.diagnostics.kds.recent}/${data.diagnostics.kds.configured} ping reciente`, 'Último ping HTTP'],
                ['Tablets', `${data.diagnostics.tablets.connected}/${data.diagnostics.tablets.inventoried} conectadas`, 'LastSeen ≤5 minutos'],
                ['Almacenamiento', `${data.diagnostics.storage.configured} destinos`, data.diagnostics.storage.types.join(', ') || 'Sin configurar'],
                ['Red', `${data.diagnostics.network.errors} errores`, `${data.diagnostics.network.entries} entradas; ${data.diagnostics.network.unknown} desconocidas`],
                ['Backups', data.diagnostics.backups.recentVerified ? 'Verificado <24h' : 'Sin copia verificada reciente', `${data.diagnostics.backups.schedules} schedules`],
                ['Actualización', new Date(data.diagnostics.measuredAt).toLocaleTimeString('es-ES'), 'Refresco automático'],
              ].map(([label, value, detail]) => (
                <Card key={label}><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p><p className="text-xs text-slate-500">{detail}</p></CardContent></Card>
              ))}
            </div>
            <Card><CardHeader><CardTitle className="text-base">Incidencias abiertas</CardTitle></CardHeader><CardContent>
              {data.incidents.length === 0 ? <p className="text-sm text-slate-500">Sin incidencias error/critical abiertas.</p> : data.incidents.map((incident, index) => (
                <div key={`${incident.createdAt}-${index}`} className="border-b py-2 text-sm last:border-0">
                  <div className="flex gap-2"><StatusBadge status="error" label={incident.level} /><b>{incident.module}</b></div>
                  <p className="mt-1">{incident.message}</p><p className="text-xs text-slate-500">{new Date(incident.createdAt).toLocaleString('es-ES')}</p>
                </div>
              ))}
            </CardContent></Card>
          </div>
        )}
      </main>
    </div>
  );
}
