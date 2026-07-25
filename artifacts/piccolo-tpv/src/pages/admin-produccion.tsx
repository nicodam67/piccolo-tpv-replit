import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { ArrowLeft, Factory, Monitor, Printer, ListRestart, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import AdminImpresoras from './admin-impresoras';
import AdminKdsStations from './admin-kds-stations';
import AdminColaImpresion from './admin-cola-impresion';

type OutputMode = 'none' | 'kds' | 'printer' | 'both';
type WorkflowProfile = 'standard' | 'pizza' | 'bar' | 'pase' | 'none';

interface Department {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
  outputMode: OutputMode;
  workflowProfile: WorkflowProfile;
  printerIds: string[];
  showInKdsNav: boolean;
  assignableToProducts: boolean;
  isPaseAggregator: boolean;
}

interface PrinterSummary {
  id: string;
  name: string;
  active: boolean;
  lastStatus: string;
}

const api = <T,>(path: string, method = 'GET', body?: unknown) =>
  customFetch<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const OUTPUT_LABELS: Record<OutputMode, string> = {
  none: 'Sin salida',
  kds: 'Solo KDS',
  printer: 'Solo impresora',
  both: 'KDS + impresora',
};

function DepartmentsTab() {
  const departmentsQuery = useQuery<Department[]>({
    queryKey: ['/api/admin/production-departments'],
    queryFn: () => api('/api/admin/production-departments'),
  });
  const printersQuery = useQuery<PrinterSummary[]>({
    queryKey: ['/api/admin/printers'],
    queryFn: () => api('/api/admin/printers'),
  });
  const departments = departmentsQuery.data ?? [];
  const printers = printersQuery.data ?? [];

  async function save(department: Department) {
    await api(`/api/admin/production-departments/${department.id}`, 'PATCH', {
      name: department.name,
      sortOrder: department.sortOrder,
      active: department.active,
      outputMode: department.outputMode,
      workflowProfile: department.workflowProfile,
      printerIds: department.printerIds,
      showInKdsNav: department.showInKdsNav,
      assignableToProducts: department.assignableToProducts,
      isPaseAggregator: department.isPaseAggregator,
    });
    toast.success('Departamento guardado');
    await departmentsQuery.refetch();
  }

  async function create() {
    const code = prompt('Código estable (minúsculas, sin espacios)');
    if (!code) return;
    const name = prompt('Nombre visible');
    if (!name) return;
    await api('/api/admin/production-departments', 'POST', {
      code,
      name,
      outputMode: 'none',
      workflowProfile: 'standard',
      printerIds: [],
      sortOrder: departments.length * 10 + 10,
    });
    toast.success('Departamento creado sin salida; configúralo antes de usarlo');
    await departmentsQuery.refetch();
  }

  async function remove(department: Department) {
    if (!confirm(`¿Desactivar "${department.name}"?`)) return;
    await api(`/api/admin/production-departments/${department.id}`, 'DELETE');
    await departmentsQuery.refetch();
  }

  if (departmentsQuery.isLoading) return <p className="p-6 text-muted-foreground">Cargando departamentos…</p>;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={create} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold flex items-center gap-2">
          <Plus size={16} /> Nuevo departamento
        </button>
      </div>
      {departments.map((department) => (
        <DepartmentCard
          key={department.id}
          initial={department}
          printers={printers}
          onSave={save}
          onDelete={remove}
        />
      ))}
    </div>
  );
}

function DepartmentCard({
  initial,
  printers,
  onSave,
  onDelete,
}: {
  initial: Department;
  printers: PrinterSummary[];
  onSave: (department: Department) => Promise<void>;
  onDelete: (department: Department) => Promise<void>;
}) {
  const [department, setDepartment] = useState(initial);
  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="grid md:grid-cols-4 gap-3">
        <label className="text-xs font-bold">Nombre
          <input value={department.name} onChange={e => setDepartment({ ...department, name: e.target.value })}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
        </label>
        <label className="text-xs font-bold">Código
          <input value={department.code} disabled
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm font-mono" />
        </label>
        <label className="text-xs font-bold">Salida
          <select value={department.outputMode}
            onChange={e => setDepartment({ ...department, outputMode: e.target.value as OutputMode })}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
            {Object.entries(OUTPUT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">Flujo KDS
          <select value={department.workflowProfile}
            onChange={e => setDepartment({ ...department, workflowProfile: e.target.value as WorkflowProfile })}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
            <option value="standard">Estándar</option>
            <option value="pizza">Pizza / horno</option>
            <option value="bar">Barra</option>
            <option value="pase">Pase agregador</option>
            <option value="none">Sin flujo</option>
          </select>
        </label>
      </div>
      <div>
        <p className="text-xs font-bold mb-2">Impresoras por prioridad</p>
        <div className="flex flex-wrap gap-2">
          {printers.map((printer) => {
            const selected = department.printerIds.includes(printer.id);
            return (
              <button key={printer.id}
                onClick={() => setDepartment({
                  ...department,
                  printerIds: selected
                    ? department.printerIds.filter(id => id !== printer.id)
                    : [...department.printerIds, printer.id],
                })}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                  selected ? 'bg-primary/15 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground'
                }`}>
                {selected ? `${department.printerIds.indexOf(printer.id) + 1}. ` : ''}{printer.name}
                {!printer.active ? ' (inactiva)' : ''}
              </button>
            );
          })}
        </div>
        {department.printerIds.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {department.printerIds.map((id, index) => {
              const selectedPrinter = printers.find(printer => printer.id === id);
              return (
                <div key={id} className="px-2 py-1 rounded bg-secondary text-xs flex items-center gap-1">
                  <span>{index + 1}. {selectedPrinter?.name ?? id}</span>
                  <button disabled={index === 0} onClick={() => {
                    const next = [...department.printerIds];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    setDepartment({ ...department, printerIds: next });
                  }}>↑</button>
                  <button disabled={index === department.printerIds.length - 1} onClick={() => {
                    const next = [...department.printerIds];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    setDepartment({ ...department, printerIds: next });
                  }}>↓</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {[
          ['active', 'Activo'],
          ['showInKdsNav', 'Mostrar en KDS'],
          ['assignableToProducts', 'Asignable a productos'],
          ['isPaseAggregator', 'Agregador de pase'],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(department[key as keyof Department])}
              onChange={e => setDepartment({ ...department, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2">Prioridad
          <input type="number" value={department.sortOrder}
            onChange={e => setDepartment({ ...department, sortOrder: Number(e.target.value) })}
            className="w-20 px-2 py-1 rounded bg-secondary border border-border" />
        </label>
        <button onClick={() => onSave(department)}
          className="ml-auto px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold flex items-center gap-2">
          <Save size={14} /> Guardar
        </button>
        <button onClick={() => onDelete(department)}
          className="px-3 py-2 rounded-lg border border-red-700 text-red-400">
          <Trash2 size={14} />
        </button>
      </div>
    </section>
  );
}

export default function AdminProduccion() {
  const [tab, setTab] = useState<'departments' | 'printers' | 'kds' | 'queue'>('departments');
  const tabs = [
    ['departments', 'Departamentos', Factory],
    ['printers', 'Impresoras y routing', Printer],
    ['kds', 'KDS y dispositivos', Monitor],
    ['queue', 'Cola, reintentos y reimpresión', ListRestart],
  ] as const;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="p-5 border-b border-border flex items-center gap-3">
        <Link href="/admin" className="p-2 rounded-lg hover:bg-secondary"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-xl font-black">Producción: KDS e impresión</h1>
          <p className="text-xs text-muted-foreground">Departamentos, prioridades, routing, retries y estado</p>
        </div>
      </header>
      <nav className="p-3 border-b border-border flex gap-2 overflow-x-auto">
        {tabs.map(([value, label, Icon]) => (
          <button key={value} onClick={() => setTab(value)}
            className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 whitespace-nowrap ${
              tab === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>
      <main className={tab === 'departments' ? 'p-5 max-w-6xl mx-auto' : ''}>
        {tab === 'departments' && <DepartmentsTab />}
        {tab === 'printers' && <AdminImpresoras />}
        {tab === 'kds' && <AdminKdsStations />}
        {tab === 'queue' && <AdminColaImpresion />}
      </main>
    </div>
  );
}
