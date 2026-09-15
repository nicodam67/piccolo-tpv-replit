import { useEffect, useState } from "react";
import { Calculator, Check, ChevronDown, ChevronUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api-client";

interface Schedule {
  id: string;
  dateFrom: string;
  dateTo: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  workCenterId?: string | null;
}
interface Position { id: string; name: string; }
interface WorkCenter { id: string; name: string; }
interface DemandRule {
  id: string;
  name: string;
  workCenterId: string;
  positionId: string;
  positionName: string;
  departmentId?: string | null;
  dayOfWeek?: number | null;
  startTime: string;
  endTime: string;
  validFrom?: string | null;
  validTo?: string | null;
  baseCount: number;
  historicalWeeks: number;
  minimumComparableWeeks: number;
  historicalMetric?: "TICKETS" | "REVENUE" | "GUESTS" | "UNITS" | null;
  historicalThreshold?: string | null;
  historicalIncrement?: number | null;
  historicalRounding?: "PER_STARTED_BLOCK" | "PER_COMPLETE_BLOCK" | "ON_THRESHOLD" | null;
  reservationGuestThreshold?: number | null;
  reservationIncrement?: number | null;
  reservationRounding?: "PER_STARTED_BLOCK" | "PER_COMPLETE_BLOCK" | "ON_THRESHOLD" | null;
  prepZone?: string | null;
  categoryId?: string | null;
  version: number;
}
interface ProposalItem {
  id: string;
  requirementDate: string;
  startTime: string;
  endTime: string;
  positionName: string;
  suggestedCount: number;
  finalCount: number;
  assignableCount: number;
  difference: number;
  historicalValue?: string | null;
  reservationGuests: number;
  comparableWeeks: number;
  explanation: {
    base: number;
    historical: { enabled: boolean; addition: number; message: string; metric?: string | null; average?: number | null };
    reservations: { enabled: boolean; guests: number; reservationCount: number; addition: number };
    result: number;
  };
}
interface Proposal {
  proposal: {
    id: string;
    status: "PROPOSED" | "REVIEWED" | "APPLIED" | "REJECTED";
    timezone: string;
    inputSummary: {
      historicalSource?: string;
      reservationSource?: string;
      historicalTickets?: number;
      attributedReservations?: number;
      configurationHash?: string;
    };
  };
  items: ProposalItem[];
  application?: { inserted: number; skippedManual: number };
}

const DAYS = [
  { value: "", label: "Todos los días" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];
const ROUNDING = [
  { value: "PER_STARTED_BLOCK", label: "Por bloque iniciado" },
  { value: "PER_COMPLETE_BLOCK", label: "Por bloque completo" },
  { value: "ON_THRESHOLD", label: "Una vez al superar el umbral" },
];
const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

type RuleForm = {
  name: string;
  positionId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  baseCount: string;
  historicalWeeks: string;
  minimumComparableWeeks: string;
  historicalMetric: string;
  historicalThreshold: string;
  historicalIncrement: string;
  historicalRounding: string;
  reservationGuestThreshold: string;
  reservationIncrement: string;
  reservationRounding: string;
  prepZone: string;
};

const emptyRule = (positionId = ""): RuleForm => ({
  name: "",
  positionId,
  dayOfWeek: "",
  startTime: "",
  endTime: "",
  baseCount: "",
  historicalWeeks: "",
  minimumComparableWeeks: "",
  historicalMetric: "",
  historicalThreshold: "",
  historicalIncrement: "",
  historicalRounding: "",
  reservationGuestThreshold: "",
  reservationIncrement: "",
  reservationRounding: "",
  prepZone: "",
});

function numberOrNull(value: string) {
  return value === "" ? null : Number(value);
}

export default function DemandNeedsPanel({ schedule, positions, onNeedsReload, onAddManual }: {
  schedule: Schedule;
  positions: Position[];
  onNeedsReload: () => void;
  onAddManual: () => void;
}) {
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [workCenterId, setWorkCenterId] = useState(schedule.workCenterId ?? "");
  const [rules, setRules] = useState<DemandRule[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [historicalWeeksOverride, setHistoricalWeeksOverride] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState("");
  const [ruleForm, setRuleForm] = useState<RuleForm>(() => emptyRule(positions[0]?.id));
  const [busy, setBusy] = useState(false);

  async function loadRules(center = workCenterId) {
    if (!center) return setRules([]);
    setRules(await api.get<DemandRule[]>(`/api/planner/demand-rules?workCenterId=${center}`));
  }
  async function loadProposal() {
    try {
      setProposal(await api.get<Proposal>(`/api/planner/schedules/${schedule.id}/need-proposals/latest`));
    } catch {
      setProposal(null);
    }
  }
  useEffect(() => {
    api.get<{ workCenters: WorkCenter[] }>("/api/planner/planning-employees")
      .then((result) => {
        setWorkCenters(result.workCenters);
        setWorkCenterId((current) => current || result.workCenters[0]?.id || "");
      })
      .catch(() => toast.error("No se pudieron cargar los centros"));
    loadProposal();
  }, [schedule.id]);
  useEffect(() => { loadRules().catch(() => toast.error("No se pudieron cargar las reglas")); }, [workCenterId]);

  function editRule(rule: DemandRule) {
    setEditingRuleId(rule.id);
    setRuleForm({
      name: rule.name,
      positionId: rule.positionId,
      dayOfWeek: rule.dayOfWeek == null ? "" : String(rule.dayOfWeek),
      startTime: rule.startTime,
      endTime: rule.endTime,
      baseCount: String(rule.baseCount),
      historicalWeeks: String(rule.historicalWeeks),
      minimumComparableWeeks: String(rule.minimumComparableWeeks),
      historicalMetric: rule.historicalMetric ?? "",
      historicalThreshold: rule.historicalThreshold ?? "",
      historicalIncrement: rule.historicalIncrement == null ? "" : String(rule.historicalIncrement),
      historicalRounding: rule.historicalRounding ?? "",
      reservationGuestThreshold: rule.reservationGuestThreshold == null ? "" : String(rule.reservationGuestThreshold),
      reservationIncrement: rule.reservationIncrement == null ? "" : String(rule.reservationIncrement),
      reservationRounding: rule.reservationRounding ?? "",
      prepZone: rule.prepZone ?? "",
    });
    setShowRules(true);
  }
  async function saveRule(event: React.FormEvent) {
    event.preventDefault();
    if (!workCenterId) return;
    const body = {
      name: ruleForm.name,
      workCenterId,
      positionId: ruleForm.positionId,
      departmentId: null,
      dayOfWeek: numberOrNull(ruleForm.dayOfWeek),
      startTime: ruleForm.startTime,
      endTime: ruleForm.endTime,
      validFrom: null,
      validTo: null,
      baseCount: Number(ruleForm.baseCount),
      historicalWeeks: Number(ruleForm.historicalWeeks),
      minimumComparableWeeks: Number(ruleForm.minimumComparableWeeks),
      historicalMetric: ruleForm.historicalMetric || null,
      historicalThreshold: numberOrNull(ruleForm.historicalThreshold),
      historicalIncrement: numberOrNull(ruleForm.historicalIncrement),
      historicalRounding: ruleForm.historicalRounding || null,
      reservationGuestThreshold: numberOrNull(ruleForm.reservationGuestThreshold),
      reservationIncrement: numberOrNull(ruleForm.reservationIncrement),
      reservationRounding: ruleForm.reservationRounding || null,
      categoryId: null,
      prepZone: ruleForm.historicalMetric === "UNITS" && ruleForm.prepZone ? ruleForm.prepZone : null,
    };
    try {
      if (editingRuleId) await api.put(`/api/planner/demand-rules/${editingRuleId}`, body);
      else await api.post("/api/planner/demand-rules", body);
      toast.success(editingRuleId ? "Nueva versión de la regla creada" : "Regla creada");
      setEditingRuleId("");
      setRuleForm(emptyRule(positions[0]?.id));
      await loadRules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la regla");
    }
  }
  async function removeRule(id: string) {
    try {
      await api.delete(`/api/planner/demand-rules/${id}`);
      toast.success("Regla desactivada");
      await loadRules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo desactivar");
    }
  }
  async function calculate() {
    if (!workCenterId) return;
    setBusy(true);
    try {
      const result = await api.post<Proposal>(`/api/planner/schedules/${schedule.id}/need-proposals/calculate`, {
        workCenterId,
        historicalWeeksOverride: numberOrNull(historicalWeeksOverride),
      });
      setProposal(result);
      toast.success("Propuesta calculada; revisa antes de aplicar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo calcular");
    } finally {
      setBusy(false);
    }
  }
  async function updateItem(item: ProposalItem, finalCount: number) {
    if (!Number.isInteger(finalCount) || finalCount < 0) {
      toast.error("La necesidad debe ser un número entero no negativo");
      await loadProposal();
      return;
    }
    setProposal(await api.patch<Proposal>(`/api/planner/need-proposal-items/${item.id}`, { finalCount }));
  }
  async function transition(action: "review" | "reject" | "apply") {
    if (!proposal) return;
    try {
      const result = await api.post<Proposal>(`/api/planner/need-proposals/${proposal.proposal.id}/${action}`, {});
      setProposal(result);
      if (action === "apply") {
        toast.success(result.application?.skippedManual
          ? `Aplicada; ${result.application.skippedManual} franja manual conservada`
          : "Necesidades aplicadas al borrador; ya puedes generar el cuadrante");
        onNeedsReload();
      } else toast.success(action === "review" ? "Propuesta revisada" : "Propuesta rechazada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la propuesta");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        <select aria-label="Centro para necesidades" className={inputClass} value={workCenterId} onChange={(event) => setWorkCenterId(event.target.value)} disabled={Boolean(schedule.workCenterId)}>
          <option value="">Selecciona centro</option>
          {workCenters.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
        </select>
        <input aria-label="Semanas históricas" type="number" min="1" max="52" className={`${inputClass} max-w-48`} placeholder="Semanas según reglas" value={historicalWeeksOverride} onChange={(event) => setHistoricalWeeksOverride(event.target.value)} />
        <button onClick={calculate} disabled={busy || !workCenterId || rules.length === 0 || schedule.status !== "DRAFT"} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Calculator size={16} /> {busy ? "Calculando…" : "Calcular necesidades"}</button>
        <button onClick={onAddManual} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground"><Plus size={16} /> Necesidad manual</button>
        <button onClick={() => setShowRules((value) => !value)} className="ml-auto flex items-center gap-1 text-sm text-violet-400">Reglas ({rules.length}) {showRules ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
      </div>

      {showRules && (
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 xl:grid-cols-[1fr_1.4fr]">
          <div>
            <h3 className="mb-2 font-semibold text-foreground">Configuración del manager</h3>
            <p className="mb-3 text-xs text-muted-foreground">No hay coeficientes implícitos: base, umbrales, incrementos y redondeo son explícitos.</p>
            <div className="space-y-2">{rules.map((rule) => <div key={rule.id} className="rounded-lg border border-border p-3"><div className="flex justify-between gap-2"><div><div className="font-medium text-foreground">{rule.name} <span className="text-xs text-muted-foreground">v{rule.version}</span></div><div className="text-xs text-muted-foreground">{rule.positionName} · {rule.startTime}–{rule.endTime} · Base {rule.baseCount}</div></div><div className="flex"><button onClick={() => editRule(rule)} className="p-2 text-violet-400"><Pencil size={14} /></button><button onClick={() => removeRule(rule.id)} className="p-2 text-red-400"><Trash2 size={14} /></button></div></div></div>)}</div>
          </div>
          <form onSubmit={saveRule} className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">{editingRuleId ? "Crear nueva versión" : "Nueva regla"}</h3>{editingRuleId && <button type="button" onClick={() => { setEditingRuleId(""); setRuleForm(emptyRule(positions[0]?.id)); }} className="text-muted-foreground"><X size={16} /></button>}</div>
            <div className="grid gap-2 md:grid-cols-2"><input required className={inputClass} placeholder="Nombre descriptivo" value={ruleForm.name} onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })} /><select required className={inputClass} value={ruleForm.positionId} onChange={(event) => setRuleForm({ ...ruleForm, positionId: event.target.value })}><option value="">Puesto</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select><select className={inputClass} value={ruleForm.dayOfWeek} onChange={(event) => setRuleForm({ ...ruleForm, dayOfWeek: event.target.value })}>{DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select><div className="grid grid-cols-2 gap-2"><input required aria-label="Inicio regla" type="time" className={inputClass} value={ruleForm.startTime} onChange={(event) => setRuleForm({ ...ruleForm, startTime: event.target.value })} /><input required aria-label="Fin regla" type="time" className={inputClass} value={ruleForm.endTime} onChange={(event) => setRuleForm({ ...ruleForm, endTime: event.target.value })} /></div></div>
            <label className="block text-xs text-muted-foreground">Personal base<input required type="number" min="0" className={`${inputClass} mt-1`} value={ruleForm.baseCount} onChange={(event) => setRuleForm({ ...ruleForm, baseCount: event.target.value })} /></label>
            <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-xs font-semibold text-foreground">Histórico real</legend><div className="grid gap-2 md:grid-cols-3"><select className={inputClass} value={ruleForm.historicalMetric} onChange={(event) => setRuleForm({ ...ruleForm, historicalMetric: event.target.value, historicalThreshold: "", historicalIncrement: "", historicalRounding: "" })}><option value="">No usar histórico</option><option value="TICKETS">Tickets</option><option value="REVENUE">Facturación</option><option value="GUESTS">Comensales</option><option value="UNITS">Unidades</option></select><input required type="number" min="1" max="52" className={inputClass} placeholder="Semanas" value={ruleForm.historicalWeeks} onChange={(event) => setRuleForm({ ...ruleForm, historicalWeeks: event.target.value })} /><input required type="number" min="1" max="52" className={inputClass} placeholder="Mínimo comparable" value={ruleForm.minimumComparableWeeks} onChange={(event) => setRuleForm({ ...ruleForm, minimumComparableWeeks: event.target.value })} />{ruleForm.historicalMetric && <><input required type="number" min="0.01" step="0.01" className={inputClass} placeholder="Umbral X" value={ruleForm.historicalThreshold} onChange={(event) => setRuleForm({ ...ruleForm, historicalThreshold: event.target.value })} /><input required type="number" min="1" className={inputClass} placeholder="Personas por bloque" value={ruleForm.historicalIncrement} onChange={(event) => setRuleForm({ ...ruleForm, historicalIncrement: event.target.value })} /><select required className={inputClass} value={ruleForm.historicalRounding} onChange={(event) => setRuleForm({ ...ruleForm, historicalRounding: event.target.value })}><option value="">Cómo aplicar</option>{ROUNDING.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{ruleForm.historicalMetric === "UNITS" && <input className={inputClass} placeholder="Zona preparación opcional" value={ruleForm.prepZone} onChange={(event) => setRuleForm({ ...ruleForm, prepZone: event.target.value })} />}</>}</div></fieldset>
            <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-xs font-semibold text-foreground">Reservas futuras</legend><div className="grid gap-2 md:grid-cols-3"><input type="number" min="1" className={inputClass} placeholder="Comensales por bloque" value={ruleForm.reservationGuestThreshold} onChange={(event) => setRuleForm({ ...ruleForm, reservationGuestThreshold: event.target.value })} /><input type="number" min="1" className={inputClass} placeholder="Personas por bloque" value={ruleForm.reservationIncrement} onChange={(event) => setRuleForm({ ...ruleForm, reservationIncrement: event.target.value })} /><select className={inputClass} value={ruleForm.reservationRounding} onChange={(event) => setRuleForm({ ...ruleForm, reservationRounding: event.target.value })}><option value="">No usar reservas</option>{ROUNDING.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></fieldset>
            <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white"><Save size={15} /> Guardar regla explícita</button>
          </form>
        </div>
      )}

      {proposal && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-foreground">Propuesta de necesidades</h3><span className="rounded-full bg-violet-500/10 px-2 py-1 text-xs text-violet-400">{proposal.proposal.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{proposal.proposal.inputSummary.historicalTickets ?? 0} tickets históricos · {proposal.proposal.inputSummary.attributedReservations ?? 0} reservas válidas · {proposal.proposal.timezone}</p></div><div className="flex gap-2">{proposal.proposal.status === "PROPOSED" && <button onClick={() => transition("review")} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"><Check size={15} /> Marcar revisada</button>}{["PROPOSED", "REVIEWED"].includes(proposal.proposal.status) && <button onClick={() => transition("reject")} className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400">Rechazar</button>}{proposal.proposal.status === "REVIEWED" && <button onClick={() => transition("apply")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Aplicar al borrador</button>}</div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-secondary/50 text-left text-xs text-muted-foreground"><tr><th className="p-3">Fecha / franja</th><th className="p-3">Puesto</th><th className="p-3">Demanda estimada</th><th className="p-3">Necesidad</th><th className="p-3">Asignables</th><th className="p-3">Diferencia</th><th className="p-3">Explicación</th></tr></thead><tbody>{proposal.items.map((item) => <tr key={item.id} className="border-t border-border align-top"><td className="p-3 text-foreground">{item.requirementDate}<br /><span className="text-muted-foreground">{item.startTime}–{item.endTime}</span></td><td className="p-3 font-medium text-foreground">{item.positionName}</td><td className="p-3 text-muted-foreground">Hist. {item.historicalValue ?? "sin datos"}<br />Reservas {item.reservationGuests} comensales</td><td className="p-3"><input aria-label={`Necesidad ${item.positionName} ${item.requirementDate} ${item.startTime}`} type="number" min="0" disabled={!["PROPOSED", "REVIEWED"].includes(proposal.proposal.status)} className="w-20 rounded border border-border bg-background px-2 py-1 text-foreground" value={item.finalCount} onChange={(event) => setProposal({ ...proposal, items: proposal.items.map((row) => row.id === item.id ? { ...row, finalCount: Number(event.target.value) } : row) })} onBlur={(event) => updateItem(item, Number(event.target.value)).catch((error) => toast.error(error.message))} /><div className="text-xs text-muted-foreground">Sugerida {item.suggestedCount}</div></td><td className="p-3 text-foreground">{item.assignableCount}</td><td className={`p-3 font-semibold ${item.difference < 0 ? "text-red-400" : "text-emerald-400"}`}>{item.difference < 0 ? `Déficit ${Math.abs(item.difference)}` : `+${item.difference}`}</td><td className="p-3 text-xs text-muted-foreground"><div>Base: {item.explanation.base}</div><div>Histórico: +{item.explanation.historical.addition} · {item.explanation.historical.message}</div><div>Reservas: +{item.explanation.reservations.addition} ({item.explanation.reservations.reservationCount})</div></td></tr>)}</tbody></table></div>
          <div className="border-t border-border p-3 text-xs text-muted-foreground">“Asignables” valida puesto, disponibilidad, ausencia, descanso, solapamientos y límites actuales; no es solo presencia teórica.</div>
        </div>
      )}
    </div>
  );
}
