import { useState, useRef, useEffect } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, Clock } from "lucide-react";
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

function parseAnvizCSV(text: string): Array<{ anvizId: string; clockIn: string; clockOut?: string }> {
  const lines = text.split("\n").filter(l => l.trim());
  const rows: Array<{ anvizId: string; clockIn: string; clockOut?: string }> = [];

  // Try to detect header row
  const hasHeader = lines[0] && isNaN(Number(lines[0].split(",")[0]?.trim()));
  const data = hasHeader ? lines.slice(1) : lines;

  for (const line of data) {
    const parts = line.split(",").map(p => p.trim().replace(/"/g, ""));
    if (parts.length < 3) continue;
    // Expected columns: anviz_id, date (YYYY-MM-DD), clock_in (HH:MM), [clock_out (HH:MM)]
    const [anvizId, date, time, timeOut] = parts;
    if (!anvizId || !date || !time) continue;
    rows.push({
      anvizId,
      clockIn: `${date}T${time}:00`,
      clockOut: timeOut ? `${date}T${timeOut}:00` : undefined,
    });
  }

  return rows;
}

export default function FichajeImportarAnviz() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Array<{ anvizId: string; clockIn: string; clockOut?: string }>>([]);
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
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setPreview(parseAnvizCSV(text).slice(0, 10));
    };
    reader.readAsText(f);
  }

  async function doImport() {
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const rows = parseAnvizCSV(text);
    const res = await api.post<ImportResult>("/api/fichaje/import/anviz", { rows, filename: file.name });
    setResult(res);
    setImporting(false);
    setFile(null);
    setPreview([]);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Importar Anviz</h1>
      <p className="text-gray-500 text-sm mb-6">Sube un CSV exportado del lector biométrico Anviz para importar los fichajes automáticamente.</p>

      {/* Format hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        <strong>Formato esperado del CSV:</strong>
        <code className="block mt-1 bg-blue-100 rounded p-2 text-xs">anviz_id, fecha (YYYY-MM-DD), hora_entrada (HH:MM), hora_salida (HH:MM)</code>
        <p className="mt-1 text-xs text-blue-600">El campo <strong>anviz_id</strong> debe coincidir con el ID Anviz del empleado en el sistema.</p>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
      >
        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">{file ? file.name : "Arrastra el CSV aquí o haz clic para seleccionar"}</p>
        <p className="text-xs text-gray-400 mt-1">Sólo archivos .csv</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b bg-gray-50 text-xs text-gray-500 font-medium">Vista previa (primeras {preview.length} filas)</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-2 text-gray-500">Anviz ID</th>
              <th className="text-left px-4 py-2 text-gray-500">Entrada</th>
              <th className="text-left px-4 py-2 text-gray-500">Salida</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {preview.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-mono">{r.anvizId}</td>
                  <td className="px-4 py-2">{r.clockIn}</td>
                  <td className="px-4 py-2 text-gray-400">{r.clockOut ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t flex justify-end">
            <button onClick={doImport} disabled={importing}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {importing ? "Importando..." : "Importar ahora"}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`mt-4 rounded-xl p-4 border ${result.imported > 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-2 font-semibold text-sm mb-2">
            {result.imported > 0 ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
            Importación completada
          </div>
          <div className="text-sm space-y-1">
            <p>✅ Importados: <strong>{result.imported}</strong></p>
            <p>⏭ Omitidos: <strong>{result.skipped}</strong></p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-medium text-red-700 text-xs mb-1">Errores:</p>
                {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">Fila {e.row}: {e.message}</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Historial de importaciones
          </h2>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-sm text-gray-800">{h.filename}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Por {h.importedByName} · {new Date(h.createdAt).toLocaleDateString("es-ES")}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-green-600 font-medium">{h.rowsImported} importados</div>
                  {h.rowsErrored > 0 && <div className="text-red-500">{h.rowsErrored} errores</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
