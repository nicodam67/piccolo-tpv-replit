import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, ChevronRight, ChevronLeft, Check, X, AlertTriangle,
  RefreshCw, Trash2, Eye, Download, Link, Unlink,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "../../lib/api-client";

type RawRow = Record<string, string>;
type ColumnMapping = {
  employeeIdentifier?: string;
  clockIn?: string;
  clockOut?: string;
  date?: string;
  identifierType?: string;
  dateFormat?: string;
};

type UploadPreview = {
  historyId: string;
  filename: string;
  fileHash: string;
  format: string;
  rowsTotal: number;
  headers: string[];
  suggestedMapping: ColumnMapping;
  preview: RawRow[];
  alreadyImported?: { id: string; confirmedAt: string } | null;
};

type ConfirmResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: number;
  pending: number;
  history: { id: string };
};

type ImportHistory = {
  id: string;
  filename: string;
  fileFormat: string;
  status: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsErrors: number;
  rowsPending: number;
  confirmedAt?: string;
  revertedAt?: string;
  createdAt: string;
};

type ImportRow = {
  id: string;
  rowNumber: number;
  status: string;
  externalIdentifier?: string;
  errorMessage?: string;
  matchedBy?: string;
  employee?: { id: string; name: string; lastName?: string } | null;
};

type ImportTemplate = {
  id: string;
  name: string;
  manufacturer: string;
  fileFormat: string;
  config: ColumnMapping;
};

type Employee = { id: string; name: string; lastName?: string };

const IDENTIFIER_TYPES = [
  { value: "anviz_id", label: "ID Anviz" },
  { value: "nfc_id", label: "ID NFC" },
  { value: "external_code", label: "Código externo" },
  { value: "name", label: "Nombre" },
];

const STEP_LABELS = [
  "Archivo",
  "Vista previa",
  "Columnas",
  "Validación",
  "Asociar",
  "Confirmar",
];

const INPUT = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500";

export default function HRImport() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string>>({}); // extId -> employeeId
  const [savePending, setSavePending] = useState<Record<string, boolean>>({});
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<string | null>(null);
  const [revertModal, setRevertModal] = useState<ImportHistory | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const { data: templates = [] } = useQuery<ImportTemplate[]>({
    queryKey: ["hr-import-templates"],
    queryFn: () => api.get<ImportTemplate[]>("/api/hr/import/templates"),
  });

  const { data: history = [], isLoading: histLoading } = useQuery<ImportHistory[]>({
    queryKey: ["hr-import-history"],
    queryFn: () => api.get<ImportHistory[]>("/api/hr/import/history"),
  });

  const { data: histRows = [] } = useQuery<ImportRow[]>({
    queryKey: ["hr-import-rows", selectedHistory],
    queryFn: () => api.get<ImportRow[]>(`/api/hr/import/history/${selectedHistory}/rows`),
    enabled: !!selectedHistory,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["hr-employees-basic"],
    queryFn: () => api.get<Employee[]>("/api/hr/employees"),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.upload<UploadPreview>("/api/hr/import/upload", fd);
    },
    onSuccess: (data) => {
      setPreview(data);
      setMapping(data.suggestedMapping);
      setRawRows([]);
      setStep(1);
      // Store preview rows from the uploaded data for later confirm
      // We ask the server for rows during confirm — but since we need them client-side,
      // we'll use the rawRows passed from the preview step
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Sin datos de previsualización");
      return api.post<ConfirmResult>("/api/hr/import/confirm", {
        historyId: preview.historyId,
        rows: rawRows,
        mapping,
        pendingAssignments,
        saveAsTemplate,
        templateName: saveAsTemplate ? templateName : undefined,
      });
    },
    onSuccess: (result) => {
      setConfirmResult(result);
      setStep(5);
      qc.invalidateQueries({ queryKey: ["hr-import-history"] });
      qc.invalidateQueries({ queryKey: ["hr-import-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revertMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/hr/import/${id}/revert`),
    onSuccess: () => {
      toast.success("Importación revertida");
      qc.invalidateQueries({ queryKey: ["hr-import-history"] });
      setRevertModal(null);
      setRevertReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error("El archivo supera el límite de 10 MB"); return; }
    // Read rows client-side to store for confirm step
    const text = await file.text();
    try {
      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        setRawRows(Array.isArray(parsed) ? parsed : [parsed]);
      } else if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        // CSV / TXT / TSV — simple parse
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length >= 2) {
          const sep = lines[0]!.includes(";") ? ";" : lines[0]!.includes("\t") ? "\t" : ",";
          const headers = lines[0]!.split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ""));
          const rows = lines.slice(1).map((line) => {
            const vals = line.split(sep).map((v) => v.trim().replace(/^["']|["']$/g, ""));
            const row: RawRow = {};
            headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
            return row;
          });
          setRawRows(rows);
        }
      }
      // For XLSX the server parses — rawRows will be empty but server handles it
    } catch { /* ignore parse errors, server will handle */ }
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const applyTemplate = (tmpl: ImportTemplate) => {
    setMapping(tmpl.config);
  };

  const empName = (e: Employee) => `${e.name} ${e.lastName ?? ""}`.trim();

  const pendingRows = rawRows.filter((row) => {
    const id = mapping.employeeIdentifier ? row[mapping.employeeIdentifier] ?? "" : "";
    return id && !employees.some((_) => false); // simplified — server does real resolution
  });

  const reset = () => {
    setStep(0);
    setPreview(null);
    setMapping({});
    setRawRows([]);
    setPendingAssignments({});
    setConfirmResult(null);
    setSaveAsTemplate(false);
    setTemplateName("");
  };

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    confirmed: { label: "Confirmada", color: "text-green-400" },
    reverted: { label: "Revertida", color: "text-red-400" },
    pending: { label: "Pendiente", color: "text-yellow-400" },
    preview: { label: "Previsualización", color: "text-blue-400" },
    error: { label: "Error", color: "text-red-400" },
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT: Wizard */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i < step ? "bg-green-600 text-white" :
                i === step ? "bg-blue-600 text-white" :
                "bg-gray-800 text-gray-500"
              }`}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`ml-1.5 text-xs ${i === step ? "text-white" : "text-gray-500"}`}>{label}</span>
              {i < STEP_LABELS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-700 mx-1" />}
            </div>
          ))}
        </div>

        {/* ─── STEP 0: Upload ─── */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Selecciona un archivo</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                dragging ? "border-blue-500 bg-blue-950/20" : "border-gray-700 hover:border-gray-500"
              }`}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-lg font-medium mb-1">Arrastra o haz clic para seleccionar</p>
              <p className="text-sm text-gray-500">CSV, XLSX, XLS, JSON, TXT · Máximo 10 MB</p>
              <p className="text-xs text-gray-600 mt-2">Compatible con cualquier reloj biométrico o sistema de fichaje</p>
            </div>
            <input ref={fileRef} type="file" className="hidden" accept=".csv,.xlsx,.xls,.json,.txt,.tsv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {uploadMutation.isPending && (
              <div className="mt-4 flex items-center gap-2 text-blue-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Procesando archivo...
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 1: Preview ─── */}
        {step === 1 && preview && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Vista previa del archivo</h2>
            <div className="flex items-center gap-4 mb-4 p-3 bg-gray-800 rounded-lg text-sm">
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="font-medium">{preview.filename}</span>
              <span className="text-gray-400">Formato: {preview.format.toUpperCase()}</span>
              <span className="text-gray-400">{preview.rowsTotal} filas</span>
              {preview.alreadyImported && (
                <span className="text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Ya importado el {new Date(preview.alreadyImported.confirmedAt).toLocaleDateString("es-ES")}
                </span>
              )}
            </div>

            {templates.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-2">Usar plantilla guardada:</p>
                <div className="flex gap-2 flex-wrap">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="px-3 py-1.5 bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 rounded-lg text-xs border border-purple-800/40">
                      {t.name} ({t.manufacturer || t.fileFormat})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-gray-800 mb-4">
              <table className="text-xs w-full">
                <thead className="bg-gray-800">
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/30">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-3 py-2 whitespace-nowrap text-gray-300">{row[h] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">
                Mapear columnas <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={reset} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Column mapping ─── */}
        {step === 2 && preview && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Mapear columnas</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Columna con ID de empleado</label>
                <select value={mapping.employeeIdentifier ?? ""} onChange={(e) => setMapping((m) => ({ ...m, employeeIdentifier: e.target.value || undefined }))} className={INPUT}>
                  <option value="">— ninguna —</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo de identificador</label>
                <select value={mapping.identifierType ?? "anviz_id"} onChange={(e) => setMapping((m) => ({ ...m, identifierType: e.target.value }))} className={INPUT}>
                  {IDENTIFIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Columna hora de entrada</label>
                <select value={mapping.clockIn ?? ""} onChange={(e) => setMapping((m) => ({ ...m, clockIn: e.target.value || undefined }))} className={INPUT}>
                  <option value="">— ninguna —</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Columna hora de salida (opcional)</label>
                <select value={mapping.clockOut ?? ""} onChange={(e) => setMapping((m) => ({ ...m, clockOut: e.target.value || undefined }))} className={INPUT}>
                  <option value="">— ninguna —</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Columna fecha separada (si la hay)</label>
                <select value={mapping.date ?? ""} onChange={(e) => setMapping((m) => ({ ...m, date: e.target.value || undefined }))} className={INPUT}>
                  <option value="">— ninguna —</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Formato de fecha/hora</label>
                <select value={mapping.dateFormat ?? "auto"} onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value }))} className={INPUT}>
                  <option value="auto">Auto-detectar</option>
                  <option value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:mm</option>
                  <option value="YYYY-MM-DD HH:mm">YYYY-MM-DD HH:mm</option>
                  <option value="MM/DD/YYYY HH:mm">MM/DD/YYYY HH:mm</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-gray-800 rounded-lg text-xs text-gray-400 mb-6">
              <p className="font-medium text-gray-300 mb-1">Vista previa con mapeo actual</p>
              <p>ID empleado: <span className="text-white">{mapping.employeeIdentifier ? `columna "${mapping.employeeIdentifier}"` : "no mapeado"}</span></p>
              <p>Entrada: <span className="text-white">{mapping.clockIn ? `columna "${mapping.clockIn}"` : "no mapeado"}</span></p>
              {mapping.clockOut && <p>Salida: <span className="text-white">columna "{mapping.clockOut}"</span></p>}
              {mapping.date && <p>Fecha: <span className="text-white">columna "{mapping.date}"</span></p>}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!mapping.employeeIdentifier || !mapping.clockIn}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50"
              >
                Validar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Validation summary ─── */}
        {step === 3 && preview && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Validación</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-blue-900/30 border border-blue-800/40 rounded-lg p-4">
                <p className="text-2xl font-bold text-blue-300">{preview.rowsTotal}</p>
                <p className="text-sm text-blue-400">Filas totales</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-300">{rawRows.length}</p>
                <p className="text-sm text-gray-400">Filas cargadas localmente</p>
              </div>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg text-sm mb-6 space-y-1">
              <p className="font-medium text-gray-300 mb-2">Configuración de importación</p>
              <p className="text-gray-400">Identificador: <span className="text-white capitalize">{mapping.identifierType?.replace("_", " ")}</span> (columna: {mapping.employeeIdentifier})</p>
              <p className="text-gray-400">Hora entrada: columna <span className="text-white">{mapping.clockIn}</span></p>
              {mapping.clockOut && <p className="text-gray-400">Hora salida: columna <span className="text-white">{mapping.clockOut}</span></p>}
              <p className="text-gray-400">Formato: <span className="text-white">{mapping.dateFormat ?? "auto"}</span></p>
            </div>

            {preview.alreadyImported && (
              <div className="flex items-start gap-3 p-3 bg-yellow-900/20 border border-yellow-900/40 rounded-lg mb-4">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-300">
                  Este archivo ya fue importado. Si confirmas, los registros duplicados se omitirán automáticamente.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button onClick={() => setStep(4)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: Pending assignments ─── */}
        {step === 4 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Asociar empleados</h2>
            <p className="text-sm text-gray-400 mb-4">
              Si hay identificadores no reconocidos, asócialos manualmente aquí. Los no asociados quedarán como "pendiente" y podrás asociarlos después.
            </p>

            {rawRows.length === 0 ? (
              <div className="p-4 bg-gray-800 rounded-lg text-sm text-gray-400">
                No se pudieron cargar las filas localmente (formato binario XLSX/XLS). El servidor resolverá los empleados al confirmar.
              </div>
            ) : (
              <>
                {/* Show unique unknown identifiers */}
                {(() => {
                  const identifiers = [...new Set(
                    rawRows.map((r) => mapping.employeeIdentifier ? r[mapping.employeeIdentifier] ?? "" : "").filter(Boolean)
                  )];
                  return identifiers.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {identifiers.slice(0, 20).map((extId) => (
                        <div key={extId} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                          <span className="font-mono text-sm text-gray-300 flex-1">{extId}</span>
                          <select
                            value={pendingAssignments[extId] ?? ""}
                            onChange={(e) => setPendingAssignments((prev) => ({
                              ...prev,
                              [extId]: e.target.value || "",
                            }))}
                            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 w-48"
                          >
                            <option value="">Auto-detectar</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>{empName(emp)}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                      {identifiers.length > 20 && (
                        <p className="text-xs text-gray-500">… y {identifiers.length - 20} más</p>
                      )}
                    </div>
                  ) : null;
                })()}
              </>
            )}

            <div className="mt-4 border-t border-gray-800 pt-4">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} className="rounded" />
                <span className="text-sm">Guardar este mapeo como plantilla para futuros archivos del mismo dispositivo</span>
              </label>
              {saveAsTemplate && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Nombre de la plantilla</label>
                    <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={INPUT} placeholder="Ej: Reloj cocina ZKTeco" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep(3)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm disabled:opacity-50"
              >
                {confirmMutation.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Importando...</> : <><Check className="w-4 h-4" /> Confirmar importación</>}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 5: Result ─── */}
        {step === 5 && confirmResult && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-900/40 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Importación completada</h2>
                <p className="text-sm text-gray-400">Los fichajes han sido creados</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-green-900/30 border border-green-800/40 rounded-lg p-4">
                <p className="text-2xl font-bold text-green-300">{confirmResult.imported}</p>
                <p className="text-sm text-green-400">Importados</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-300">{confirmResult.skipped}</p>
                <p className="text-sm text-gray-400">Duplicados omitidos</p>
              </div>
              {confirmResult.errors > 0 && (
                <div className="bg-red-900/30 border border-red-800/40 rounded-lg p-4">
                  <p className="text-2xl font-bold text-red-300">{confirmResult.errors}</p>
                  <p className="text-sm text-red-400">Errores</p>
                </div>
              )}
              {confirmResult.pending > 0 && (
                <div className="bg-yellow-900/30 border border-yellow-800/40 rounded-lg p-4">
                  <p className="text-2xl font-bold text-yellow-300">{confirmResult.pending}</p>
                  <p className="text-sm text-yellow-400">Pendientes de asociar</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={reset} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">
                Nueva importación
              </button>
              <button onClick={() => setSelectedHistory(confirmResult.history.id)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2">
                <Eye className="w-4 h-4" /> Ver detalles
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: History */}
      <div className="w-80 flex-shrink-0 border-l border-gray-800 flex flex-col bg-gray-900">
        <div className="p-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold">Historial de importaciones</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {histLoading ? (
            <p className="p-4 text-center text-gray-500 text-sm">Cargando...</p>
          ) : history.length === 0 ? (
            <p className="p-4 text-center text-gray-500 text-sm">Sin importaciones</p>
          ) : (
            [...history].reverse().map((h) => {
              const sc = STATUS_CONFIG[h.status] ?? { label: h.status, color: "text-gray-400" };
              return (
                <button key={h.id} onClick={() => setSelectedHistory(h.id === selectedHistory ? null : h.id)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-800/50 hover:bg-gray-800 transition-colors ${selectedHistory === h.id ? "bg-gray-800" : ""}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{h.filename}</span>
                    <span className={`text-xs ${sc.color}`}>{sc.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{h.rowsImported} importadas</span>
                    {h.rowsSkipped > 0 && <span>{h.rowsSkipped} omitidas</span>}
                    {h.rowsPending > 0 && <span className="text-yellow-500">{h.rowsPending} pendientes</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{new Date(h.createdAt).toLocaleDateString("es-ES")}</p>
                  {h.status === "confirmed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRevertModal(h); setRevertReason(""); }}
                      className="mt-1.5 flex items-center gap-1 text-xs text-red-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" /> Revertir
                    </button>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Row details */}
        {selectedHistory && histRows.length > 0 && (
          <div className="border-t border-gray-800 max-h-60 overflow-y-auto">
            <div className="p-2 text-xs text-gray-500 font-medium">Filas</div>
            {histRows.map((row) => (
              <div key={row.id} className={`px-3 py-2 border-t border-gray-800/50 text-xs ${
                row.status === "imported" ? "text-green-400" :
                row.status === "skipped" ? "text-gray-500" :
                row.status === "error" ? "text-red-400" :
                row.status === "pending" ? "text-yellow-400" : "text-gray-400"
              }`}>
                <span className="text-gray-600">#{row.rowNumber}</span> {row.employee ? `${row.employee.name} ${row.employee.lastName ?? ""}`.trim() : row.externalIdentifier ?? "?"} — {row.status}
                {row.errorMessage && <p className="text-red-500 text-xs truncate">{row.errorMessage}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revert Modal */}
      {revertModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold text-red-400">Revertir importación</h3>
              <button onClick={() => setRevertModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3 p-3 bg-red-900/20 border border-red-900/40 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">
                  Se eliminarán <strong>{revertModal.rowsImported} registros de time_records</strong> generados por esta importación. Esta acción no se puede deshacer.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Motivo (opcional)</label>
                <textarea value={revertReason} onChange={(e) => setRevertReason(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none h-20 resize-none"
                  placeholder="Explica por qué se revierte..." />
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
              <button onClick={() => setRevertModal(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => revertMutation.mutate(revertModal.id)} disabled={revertMutation.isPending}
                className="px-4 py-2 bg-red-800 hover:bg-red-700 text-red-100 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                {revertMutation.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Revirtiendo...</> : <><Trash2 className="w-4 h-4" /> Revertir</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
