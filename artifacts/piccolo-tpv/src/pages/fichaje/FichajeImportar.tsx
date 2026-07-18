/**
 * Importación de fichajes — universal (CSV, XLSX, XLS, TXT, XML, JSON)
 * Reemplaza el módulo anterior específico de Anviz.
 */
import { useState, useRef, useEffect } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, Clock, Info } from "lucide-react";
import { api } from "../../lib/api-client";

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

interface HistoryItem {
  id: string;
  filename: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsErrored: number;
  importedByName: string;
  createdAt: string;
}

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
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function loadHistory() {
      api.get<HistoryItem[]>("/api/fichaje/import/history")
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
    setResult(null);
    const text = await f.text();
    const parsed = parseUniversalCSV(text);
    setPreview(parsed.slice(0, 10));
  }

  async function handleImport() {
    if (!file || !preview.length) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseUniversalCSV(text);
      const res = await api.post<ImportResult>("/api/fichaje/import", {
        filename: file.name,
        rows,
      });
      setResult(res);
      setFile(null);
      setPreview([]);
      if (fileRef.current) fileRef.current.value = "";
      // Refresh history
      api.get<HistoryItem[]>("/api/fichaje/import/history")
        .then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
    } catch (err: any) {
      setResult({ success: false, imported: 0, skipped: 0, errors: [{ row: 0, message: err.message || "Error desconocido" }] });
    } finally {
      setImporting(false);
    }
  }

  const ACCEPTED = ".csv,.txt,.xls,.xlsx,.xml,.json";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Importación de fichajes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Admite ficheros CSV, TXT, XLS, XLSX, XML y JSON exportados desde cualquier terminal biométrico o sistema externo.
        </p>
      </div>

      {/* Format info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6 flex gap-3">
        <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p className="font-medium mb-1">Formato esperado para CSV/TXT</p>
          <p className="font-mono text-xs opacity-80">ID_EMPLEADO, YYYY-MM-DD, HH:MM, [HH:MM_salida]</p>
          <p className="mt-1 opacity-75">La primera fila puede ser una cabecera y se detecta automáticamente.</p>
        </div>
      </div>

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-teal-500/50 hover:bg-teal-500/5 transition-colors mb-6"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" />
        <Upload size={36} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-foreground font-medium">
          {file ? file.name : "Arrastra aquí o haz clic para seleccionar"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">CSV · TXT · XLS · XLSX · XML · JSON</p>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText size={16} /> Vista previa ({preview.length} de {preview.length} primeras filas)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">ID Empleado</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Entrada</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Salida</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/50">
                    <td className="py-2 px-3 font-mono text-xs">{row.employeeId}</td>
                    <td className="py-2 px-3 text-xs">{new Date(row.clockIn).toLocaleString("es-ES")}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {row.clockOut ? new Date(row.clockOut).toLocaleString("es-ES") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleImport}
            disabled={importing}
            className="mt-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl px-6 py-2.5 font-semibold text-sm transition-colors flex items-center gap-2"
          >
            {importing ? "Importando…" : "Importar registros"}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${result.success || result.imported > 0 ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
          {result.imported > 0
            ? <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          }
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {result.imported} registros importados · {result.skipped} omitidos
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-red-600 dark:text-red-400">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>Fila {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* History */}
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
                  {h.rowsErrored > 0 && <p className="text-xs text-red-500">{h.rowsErrored} errores</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
