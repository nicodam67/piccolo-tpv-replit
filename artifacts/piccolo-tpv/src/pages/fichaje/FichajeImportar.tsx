/**
 * Importación universal — LEGACY / NO OPERATIVO
 * POST /api/fichaje/import no existe en backend. Usar FichajeImportarAnviz para Anviz.
 */
import { useState, useRef, useEffect } from "react";
import { Upload, FileText, AlertTriangle, Clock, Info } from "lucide-react";
import { getTimeclockImportHistory } from "@workspace/api-client-react/timeclock";
import type { TimeclockImportHistoryItem } from "@workspace/api-client-react/timeclock";

interface ParsedRow {
  employeeId: string;
  clockIn: string;
  clockOut?: string;
}

function parseUniversalCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const rows: ParsedRow[] = [];
  const hasHeader = lines[0] && isNaN(Number(lines[0].split(",")[0]?.trim()));
  const data = hasHeader ? lines.slice(1) : lines;

  for (const line of data) {
    const parts = line.split(",").map(p => p.trim().replace(/"/g, ""));
    if (parts.length < 3) continue;
    const [employeeId, date, time, timeOut] = parts;
    if (!employeeId || !date || !time) continue;
    rows.push({
      employeeId,
      clockIn: `${date}T${time.includes(':') ? time : time.slice(0, 2) + ':' + time.slice(2)}:00`,
      clockOut: timeOut ? `${date}T${timeOut.includes(':') ? timeOut : timeOut.slice(0, 2) + ':' + timeOut.slice(2)}:00` : undefined,
    });
  }
  return rows;
}

export default function FichajeImportar() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [history, setHistory] = useState<TimeclockImportHistoryItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function loadHistory() {
      getTimeclockImportHistory()
        .then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
    }
    loadHistory();
    const onVisibility = () => { if (!document.hidden) loadHistory(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const text = await f.text();
    setPreview(parseUniversalCSV(text).slice(0, 10));
  }

  const ACCEPTED = ".csv,.txt,.xls,.xlsx,.xml,.json";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Importación de fichajes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pantalla legacy — la importación universal no está disponible en el backend actual.
        </p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex gap-3">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <p className="font-medium mb-1">Importación deshabilitada</p>
          <p>El endpoint <code className="bg-amber-500/10 px-1 rounded">POST /fichaje/import</code> no existe. Para fichajes Anviz use la pantalla <strong>Importar Anviz</strong> (<code>/fichaje/import/anviz</code>).</p>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6 flex gap-3 opacity-60">
        <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p className="font-medium mb-1">Formato esperado para CSV/TXT (referencia)</p>
          <code className="block mt-1 bg-blue-100 dark:bg-blue-950 rounded p-2 text-xs">ID_EMPLEADO, YYYY-MM-DD, HH:MM, [HH:MM_salida]</code>
        </div>
      </div>

      <div
        className="border-2 border-dashed border-border rounded-2xl p-10 text-center mb-6 opacity-50 pointer-events-none"
        aria-disabled="true"
      >
        <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" disabled />
        <Upload size={36} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-foreground font-medium">
          {file ? file.name : "Importación no disponible"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Use Importar Anviz para el flujo soportado</p>
      </div>

      {preview.length > 0 && (
        <div className="mb-6 opacity-50">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText size={16} /> Vista previa (solo lectura)
          </h2>
          <p className="text-xs text-muted-foreground mb-2">{preview.length} filas detectadas — no se enviarán al servidor.</p>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock size={16} /> Historial de importaciones
          </h2>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3 text-sm">
                <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{h.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString("es-ES")} · por {h.importedByName}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium text-green-600">{h.rowsImported} importados</p>
                  {h.rowsSkipped > 0 && <p className="text-xs text-muted-foreground">{h.rowsSkipped} omitidos</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
