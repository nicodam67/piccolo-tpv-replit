import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { useAuth } from '../../providers/AuthProvider';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';

interface ImportDraft {
  name: string;
  internalCode: string;
  category: string;
  price: number | null;
  taxRate: number;
  prepZone: string;
  allergens: string[];
  description: string;
  qrVisible: boolean;
  halfPortionPrice: number | null;
  imageUrl: string;
}

interface ImportRow {
  rowIndex: number;
  draft: ImportDraft;
  severity: 'ok' | 'warning' | 'error';
  codes: string[];
  messages: string[];
  action: 'create' | 'update' | 'skip';
}

interface ImportSession {
  sessionId: string;
  status: string;
  filename: string;
  sourceFormat: string;
  rows: ImportRow[];
  summary: {
    total: number;
    valid: number;
    errors: number;
    warnings: number;
    creates: number;
    updates: number;
    skips: number;
  };
}

interface ImportResult {
  sessionId: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  createdCategories: number;
  qrSync: { automatic: boolean; sourceOfTruth: string; message: string };
}

const SUMMARY_LABELS: Record<string, string> = {
  total: 'Filas',
  valid: 'Válidas',
  errors: 'Con errores',
  warnings: 'Avisos',
  creates: 'Nuevas',
  updates: 'Actualizar',
  skips: 'Omitidas',
};

export default function InitialCatalogImport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

  const visibleRows = useMemo(() => rows.slice(0, 100), [rows]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${base}/api/admin/catalog-import/sessions`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No se pudo analizar el archivo');
      setSession(body);
      setRows(body.rows);
      setChanged(new Set());
      setResult(null);
      toast.success(`Vista previa creada: ${body.summary.total} filas`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Importación no válida');
    } finally {
      setBusy(false);
    }
  }

  function updateRow(rowIndex: number, changes: Partial<ImportDraft>) {
    setRows((current) => current.map((row) =>
      row.rowIndex === rowIndex ? { ...row, draft: { ...row.draft, ...changes } } : row));
    setChanged((current) => new Set(current).add(rowIndex));
  }

  async function saveCorrections() {
    if (!session || changed.size === 0) return;
    setBusy(true);
    try {
      const corrections = rows.filter((row) => changed.has(row.rowIndex)).map((row) => ({
        rowIndex: row.rowIndex,
        changes: row.draft,
      }));
      const updated = await api.patch<ImportSession>(
        `/api/admin/catalog-import/sessions/${session.sessionId}/rows`,
        { corrections, allowOverwrite },
      );
      setSession(updated);
      setRows(updated.rows);
      setChanged(new Set());
      toast.success('Correcciones validadas');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron guardar las correcciones');
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!session) return;
    setBusy(true);
    try {
      const updated = await api.post<ImportSession>(
        `/api/admin/catalog-import/sessions/${session.sessionId}/validate`,
        { allowOverwrite },
      );
      setSession(updated);
      setRows(updated.rows);
      toast.success(updated.summary.errors ? 'Quedan errores por corregir' : 'Carta lista para confirmar');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Validación fallida');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!session || session.summary.errors > 0 || changed.size > 0) return;
    setBusy(true);
    try {
      const confirmed = await api.post<ImportResult>(
        `/api/admin/catalog-import/sessions/${session.sessionId}/confirm`,
        { allowOverwrite },
        { headers: { 'Idempotency-Key': crypto.randomUUID() }, timeoutMs: 60_000 },
      );
      setResult(confirmed);
      await queryClient.invalidateQueries({ queryKey: ['installation-assistant'] });
      toast.success('Carta importada; QR Menú sincronizado con el catálogo TPV');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo confirmar la importación');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Card className="border-emerald-300">
        <CardContent className="space-y-4 p-6">
          <CheckCircle2 className="text-emerald-600" size={34} />
          <div><h2 className="text-xl font-bold">Carta inicial importada</h2><p className="text-sm text-slate-600">El TPV PostgreSQL es la fuente principal. El QR Menú integrado consulta ese mismo catálogo.</p></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Importadas', result.imported],
              ['Actualizadas', result.updated],
              ['Omitidas', result.skipped],
              ['Fallidas', result.failed],
              ['Categorías nuevas', result.createdCategories],
            ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-100 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold">{value}</p></div>)}
          </div>
          <p className="rounded-lg bg-cyan-50 p-3 text-sm text-cyan-900">{result.qrSync.message}</p>
          <Button variant="outline" onClick={() => { setSession(null); setRows([]); setResult(null); }}>Importar otro archivo</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet size={19} /> Etapa opcional: carta inicial</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">Carga CSV, XLSX o una exportación JSON compatible de QR Menú. Nada se guarda hasta revisar y confirmar.</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={16} /> Seleccionar archivo</Button>
            <Button variant="outline" onClick={() => window.open(`${base}/api/admin/products/export?format=xlsx`, '_blank')}>Descargar plantilla</Button>
            <Button variant="ghost" onClick={() => toast.info('Etapa omitida. Puedes importar la carta más adelante desde Productos.')}>Omitir por ahora</Button>
          </div>
        </CardContent>
      </Card>

      {session && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {Object.entries(session.summary).map(([label, value]) => (
              <Card key={label}><CardContent className="p-3"><p className="text-xs text-slate-500">{SUMMARY_LABELS[label] ?? label}</p><p className="text-xl font-bold">{value}</p></CardContent></Card>
            ))}
          </div>
          {user?.role === 'admin' && (
            <label className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <input type="checkbox" checked={allowOverwrite} onChange={(event) => setAllowOverwrite(event.target.checked)} />
              Autorizar actualización explícita de productos duplicados
            </label>
          )}
          <div className="sticky top-[108px] z-10 flex flex-wrap gap-2 rounded-lg border bg-white/95 p-3 shadow-sm backdrop-blur">
            <Button
              variant="outline"
              className="border-cyan-700 bg-white text-cyan-900 hover:bg-cyan-50 disabled:border-slate-300 disabled:text-slate-500"
              onClick={saveCorrections}
              disabled={busy || changed.size === 0}
            >
              Guardar y validar correcciones ({changed.size})
            </Button>
            <Button
              variant="outline"
              className="border-slate-500 bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-500"
              onClick={validate}
              disabled={busy || changed.size > 0}
            >
              Validar de nuevo
            </Button>
            <Button onClick={confirm} disabled={busy || session.summary.errors > 0 || changed.size > 0}>
              {busy && <Loader2 size={15} className="animate-spin" />} Confirmar importación
            </Button>
            {changed.size > 0 && <span className="self-center text-xs font-medium text-amber-700">Guarda las correcciones antes de confirmar.</span>}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Vista previa — {session.filename}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-xs">
                <thead><tr className="border-b text-left"><th>Fila</th><th>Estado</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>IVA</th><th>Departamento</th><th>Alérgenos</th><th>Acción</th></tr></thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.rowIndex} className={`border-b ${row.severity === 'error' ? 'bg-red-50' : row.severity === 'warning' ? 'bg-amber-50' : ''}`}>
                      <td className="p-1">{row.rowIndex}</td>
                      <td className="p-1" title={row.messages.join(' · ')}>
                        {row.severity === 'error'
                          ? <span className="flex items-center gap-1 font-semibold text-red-700"><AlertTriangle size={16} /> Error</span>
                          : row.severity === 'warning' ? <span className="text-amber-700">Revisar</span> : <span className="text-emerald-700">Válida</span>}
                      </td>
                      <td>
                        <Input className="h-8" value={row.draft.name} onChange={(event) => updateRow(row.rowIndex, { name: event.target.value })} />
                        {row.messages.length > 0 && <p className={`mt-1 max-w-56 text-[10px] ${row.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{row.messages.join(' · ')}</p>}
                      </td>
                      <td><Input className="h-8" value={row.draft.category} onChange={(event) => updateRow(row.rowIndex, { category: event.target.value })} /></td>
                      <td><Input className="h-8 w-24" type="number" step="0.01" value={row.draft.price ?? ''} onChange={(event) => updateRow(row.rowIndex, { price: event.target.value ? Number(event.target.value) : null })} /></td>
                      <td><Input className="h-8 w-20" type="number" value={row.draft.taxRate} onChange={(event) => updateRow(row.rowIndex, { taxRate: Number(event.target.value) })} /></td>
                      <td><Input className="h-8" value={row.draft.prepZone} onChange={(event) => updateRow(row.rowIndex, { prepZone: event.target.value })} /></td>
                      <td><Input className="h-8" value={row.draft.allergens.join(',')} onChange={(event) => updateRow(row.rowIndex, { allergens: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></td>
                      <td className="p-1 font-semibold">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && <p className="mt-2 text-xs text-slate-500">Se muestran 100 de {rows.length} filas. El informe final incluye todas.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
