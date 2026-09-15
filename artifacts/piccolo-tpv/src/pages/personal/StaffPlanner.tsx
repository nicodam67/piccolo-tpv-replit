import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api-client";
import { useAuth } from "../../providers/AuthProvider";
import { hasPermission } from "../../lib/permissions";
import AvailabilityPlanner from "./AvailabilityPlanner";

type Tab = "week" | "month" | "needs" | "availability" | "drafts" | "published" | "issues" | "changes";
interface Schedule {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  generatedAt?: string | null;
}
interface Position { id: string; name: string; }
interface Employee { id: string; name: string; }
interface Requirement {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
  positionName: string;
  requiredCount: number;
}
interface Shift {
  id?: string;
  employeeId: string;
  employeeName: string;
  requirementId?: string | null;
  positionId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  origin: string;
  notes?: string | null;
}
interface Issue { id?: string; code: string; message: string; shiftId?: string | null; }
interface ShiftSnapshot {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
}
interface ShiftChange {
  id: string;
  requestType: "SWAP" | "TRANSFER" | "TIME_CHANGE" | "OPEN_REQUEST";
  status: string;
  requesterId: string;
  requesterName: string;
  recipientId?: string | null;
  recipientName?: string | null;
  originalSnapshot: ShiftSnapshot;
  counterpartSnapshot?: ShiftSnapshot | null;
  proposal: { date?: string; startTime?: string; endTime?: string };
  requesterComment?: string | null;
  managerComment?: string | null;
  validationIssues: Issue[];
  createdAt: string;
}
interface Context {
  schedule: Schedule;
  requirements: Requirement[];
  employeeRows: Employee[];
  shiftRows: Shift[];
  positions: Position[];
  issues: Issue[];
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "needs", label: "Necesidades" },
  { id: "availability", label: "Disponibilidad" },
  { id: "drafts", label: "Borradores" },
  { id: "published", label: "Publicados" },
  { id: "issues", label: "Incidencias / cambios" },
  { id: "changes", label: "Cambios de turno" },
];
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + count);
  return next;
}
function monday(date: Date) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() - ((next.getUTCDay() + 6) % 7));
  return next;
}

function StatusBadge({ status }: { status: Schedule["status"] }) {
  const styles = status === "PUBLISHED"
    ? "bg-emerald-500/10 text-emerald-500"
    : status === "DRAFT"
      ? "bg-amber-500/10 text-amber-500"
      : "bg-secondary text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}>{status}</span>;
}

export default function StaffPlanner() {
  const { user } = useAuth();
  const canManagePlanner = hasPermission(user?.role, "planner.manage");
  const canManageChanges = hasPermission(user?.role, "shift_changes.manage");
  const [tab, setTab] = useState<Tab>("week");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => monday(new Date()));
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showNeedForm, setShowNeedForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [requestingShift, setRequestingShift] = useState<Shift | null>(null);

  async function loadSchedules(preferredId?: string) {
    const rows = await api.get<Schedule[]>("/api/planner/schedules");
    setSchedules(rows);
    const nextId = preferredId ?? selectedId ?? rows[0]?.id ?? "";
    if (nextId) setSelectedId(nextId);
    else setLoading(false);
  }
  async function loadContext(id = selectedId) {
    if (!id) { setContext(null); return; }
    setLoading(true);
    try {
      setContext(await api.get<Context>(`/api/planner/schedules/${id}`));
    } catch {
      setContext(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadSchedules().catch(() => setLoading(false)); }, []);
  useEffect(() => { if (selectedId) loadContext(selectedId); }, [selectedId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  async function action(path: string, success: string) {
    try {
      await api.post(path);
      toast.success(success);
      await Promise.all([loadContext(), loadSchedules(selectedId)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la operación");
      await loadContext();
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Personal</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Planificador automático</h1>
          <p className="mt-1 text-sm text-muted-foreground">Necesidades, asignación determinista y publicación controlada.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {context && <StatusBadge status={context.schedule.status} />}
          <select
            aria-label="Cuadrante seleccionado"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="">Seleccionar cuadrante</option>
            {schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}
          </select>
          {canManagePlanner && <button onClick={() => setShowScheduleForm(true)} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            <Plus size={16} /> Nuevo periodo
          </button>}
        </div>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {TABS.filter((item) => canManagePlanner || !["needs", "drafts", "issues"].includes(item.id)).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === item.id ? "bg-violet-500/15 text-violet-400" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            {item.label}
            {item.id === "issues" && context?.issues.length ? <span className="ml-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{context.issues.length}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-24 text-center text-muted-foreground">Cargando planificador…</div>
      ) : !context && !["drafts", "published", "changes", "availability"].includes(tab) ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CalendarDays className="mx-auto mb-3 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Crea el primer periodo de planificación</h2>
          <p className="mt-1 text-sm text-muted-foreground">Después podrás añadir necesidades y generar un borrador.</p>
        </div>
      ) : (
        <>
          {tab === "week" && context && (
            <WeekView
              context={context}
              days={days}
              onPrevious={() => setWeekStart((value) => addDays(value, -7))}
              onNext={() => setWeekStart((value) => addDays(value, 7))}
              onToday={() => setWeekStart(monday(new Date()))}
              onEdit={setEditingShift}
              onRequest={setRequestingShift}
              currentEmployeeId={user?.id}
              canManagePlanner={canManagePlanner}
              onAdd={() => setEditingShift({
                employeeId: context.employeeRows[0]?.id ?? "",
                employeeName: "",
                positionId: context.positions[0]?.id ?? "",
                date: iso(days[0]),
                startTime: "12:00",
                endTime: "17:00",
                origin: "manual",
              })}
              onGenerate={() => action(`/api/planner/schedules/${context.schedule.id}/generate`, "Borrador generado")}
              onValidate={() => action(`/api/planner/schedules/${context.schedule.id}/validate`, "Cuadrante validado")}
              onPublish={() => action(`/api/planner/schedules/${context.schedule.id}/publish`, "Cuadrante publicado")}
            />
          )}
          {tab === "month" && context && <MonthView context={context} />}
          {tab === "needs" && context && (
            <NeedsView context={context} onAdd={() => setShowNeedForm(true)} onReload={() => loadContext()} />
          )}
          {tab === "availability" && (
            <AvailabilityPlanner currentEmployeeId={user?.id ?? ""} canManage={canManagePlanner} />
          )}
          {tab === "drafts" && <ScheduleList rows={schedules.filter((row) => row.status === "DRAFT")} onSelect={(id) => { setSelectedId(id); setTab("week"); }} />}
          {tab === "published" && <ScheduleList rows={schedules.filter((row) => row.status === "PUBLISHED")} onSelect={(id) => { setSelectedId(id); setTab("week"); }} />}
          {tab === "issues" && context && <IssuesView issues={context.issues} />}
          {tab === "changes" && (
            <ShiftChangesView
              currentEmployeeId={user?.id ?? ""}
              canManage={canManageChanges}
            />
          )}
        </>
      )}

      {showScheduleForm && <ScheduleForm onClose={() => setShowScheduleForm(false)} onCreated={async (id) => { setShowScheduleForm(false); await loadSchedules(id); }} />}
      {showNeedForm && context && <NeedForm schedule={context.schedule} positions={context.positions} onClose={() => setShowNeedForm(false)} onSaved={async () => { setShowNeedForm(false); await loadContext(); }} />}
      {editingShift && context && <ShiftForm context={context} shift={editingShift} onClose={() => setEditingShift(null)} onSaved={async () => { setEditingShift(null); await loadContext(); }} />}
      {requestingShift?.id && (
        <ShiftChangeForm
          shift={requestingShift as Shift & { id: string }}
          onClose={() => setRequestingShift(null)}
          onSaved={() => { setRequestingShift(null); setTab("changes"); }}
        />
      )}
    </div>
  );
}

function WeekView({ context, days, onPrevious, onNext, onToday, onEdit, onRequest, currentEmployeeId, canManagePlanner, onAdd, onGenerate, onValidate, onPublish }: {
  context: Context;
  days: Date[];
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onEdit: (shift: Shift) => void;
  onRequest: (shift: Shift) => void;
  currentEmployeeId?: string;
  canManagePlanner: boolean;
  onAdd: () => void;
  onGenerate: () => void;
  onValidate: () => void;
  onPublish: () => void;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button aria-label="Semana anterior" onClick={onPrevious} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary"><ChevronLeft size={17} /></button>
          <button onClick={onToday} className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-secondary">Hoy</button>
          <button aria-label="Semana siguiente" onClick={onNext} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary"><ChevronRight size={17} /></button>
          <span className="ml-2 text-sm font-medium text-foreground">{days[0].toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
        </div>
        {context.schedule.status === "DRAFT" && canManagePlanner && (
          <div className="flex flex-wrap gap-2">
            <button onClick={onAdd} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-secondary"><Plus size={15} /> Asignación manual</button>
            <button onClick={onGenerate} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"><Sparkles size={16} /> Generar cuadrante</button>
            <button onClick={onValidate} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-secondary"><RefreshCw size={15} /> Validar</button>
            <button onClick={onPublish} disabled={context.issues.length > 0} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Send size={15} /> Publicar cuadrante</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="grid min-w-[900px] grid-cols-7 divide-x divide-border">
          {days.map((day, index) => {
            const date = iso(day);
            const shifts = context.shiftRows.filter((shift) => shift.date === date);
            const needs = context.requirements.filter((need) => need.date === date);
            return (
              <div key={date} className="min-h-[360px]">
                <div className="sticky top-0 z-10 border-b border-border bg-secondary/95 p-3 text-center backdrop-blur">
                  <div className="text-xs font-bold uppercase text-muted-foreground">{DAY_NAMES[index]}</div>
                  <div className="mt-1 text-lg font-bold text-foreground">{day.getUTCDate()}</div>
                </div>
                <div className="space-y-2 p-2">
                  {needs.map((need) => (
                    <div key={need.id} className="rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 px-2 py-1.5 text-[11px] text-violet-400">
                      {need.startTime}–{need.endTime} · {need.requiredCount} {need.positionName}
                    </div>
                  ))}
                  {shifts.map((shift) => {
                    const canEdit = context.schedule.status === "DRAFT" && canManagePlanner;
                    const canRequest = context.schedule.status === "PUBLISHED" && shift.employeeId === currentEmployeeId;
                    return (
                    <button key={shift.id} disabled={!canEdit && !canRequest} onClick={() => canEdit ? onEdit(shift) : onRequest(shift)} className="w-full rounded-lg border border-teal-500/20 bg-teal-500/10 p-2 text-left enabled:hover:border-teal-500/50 disabled:cursor-default">
                      <div className="truncate text-xs font-semibold text-teal-400">{shift.employeeName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{shift.startTime}–{shift.endTime}</div>
                      <div className="mt-1 text-[10px] uppercase text-muted-foreground/70">{shift.origin === "generated" ? "Automático" : "Manual"}</div>
                      {canRequest && <div className="mt-1 text-[10px] font-semibold text-violet-400">Solicitar cambio</div>}
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MonthView({ context }: { context: Context }) {
  const start = new Date(`${context.schedule.dateFrom}T12:00:00Z`);
  const end = new Date(`${context.schedule.dateTo}T12:00:00Z`);
  const dates: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {dates.map((date) => {
        const key = iso(date);
        const count = context.shiftRows.filter((shift) => shift.date === key).length;
        return <div key={key} className="min-h-24 rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{date.toLocaleDateString("es-ES", { weekday: "short" })}</div><div className="text-lg font-bold text-foreground">{date.getUTCDate()}</div><div className="mt-3 text-xs text-violet-400">{count} turnos</div></div>;
      })}
    </div>
  );
}

function NeedsView({ context, onAdd, onReload }: { context: Context; onAdd: () => void; onReload: () => void }) {
  async function remove(id: string) {
    await api.delete(`/api/planner/requirements/${id}`);
    toast.success("Necesidad eliminada");
    onReload();
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-semibold text-foreground">Necesidades de personal</h2><p className="text-xs text-muted-foreground">Los puestos proceden del catálogo configurable de RRHH.</p></div><button onClick={onAdd} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm text-white"><Plus size={15} /> Añadir</button></div>
      <div className="divide-y divide-border">
        {context.requirements.map((need) => <div key={need.id} className="grid grid-cols-[1fr_auto] items-center gap-3 p-4"><div><div className="text-sm font-semibold text-foreground">{new Date(`${need.date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}</div><div className="mt-1 text-sm text-muted-foreground">{need.startTime}–{need.endTime} · <span className="text-violet-400">{need.requiredCount} × {need.positionName}</span></div></div><button aria-label="Eliminar necesidad" onClick={() => remove(need.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"><Trash2 size={16} /></button></div>)}
        {!context.requirements.length && <p className="p-8 text-center text-sm text-muted-foreground">Todavía no hay necesidades definidas.</p>}
      </div>
    </div>
  );
}

function ScheduleList({ rows, onSelect }: { rows: Schedule[]; onSelect: (id: string) => void }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <button key={row.id} onClick={() => onSelect(row.id)} className="rounded-xl border border-border bg-card p-4 text-left hover:border-violet-500/50"><div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">{row.name}</h3><StatusBadge status={row.status} /></div><p className="mt-3 text-sm text-muted-foreground">{row.dateFrom} → {row.dateTo}</p></button>)}{!rows.length && <p className="col-span-full py-16 text-center text-muted-foreground">No hay cuadrantes en este estado.</p>}</div>;
}

function IssuesView({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center"><CheckCircle2 className="mx-auto text-emerald-500" /><h2 className="mt-3 font-semibold text-foreground">Sin incidencias</h2><p className="text-sm text-muted-foreground">El cuadrante cumple las restricciones obligatorias.</p></div>;
  return <div className="space-y-2">{issues.map((issue, index) => <div key={issue.id ?? `${issue.code}-${index}`} className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4"><AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={18} /><div><div className="text-xs font-bold uppercase text-red-400">{issue.code}</div><p className="mt-1 text-sm text-foreground">{issue.message}</p></div></div>)}</div>;
}

const CHANGE_TYPE_LABELS: Record<ShiftChange["requestType"], string> = {
  SWAP: "Intercambio",
  TRANSFER: "Cesión",
  TIME_CHANGE: "Cambio de horario",
  OPEN_REQUEST: "Solicitud al responsable",
};

const CHANGE_STATUS_LABELS: Record<string, string> = {
  PENDING_RECIPIENT: "Pendiente del empleado",
  PENDING_MANAGER: "Pendiente del responsable",
  REJECTED_BY_RECIPIENT: "Rechazada por el empleado",
  REJECTED_BY_MANAGER: "Rechazada por el responsable",
  APPROVED: "Aprobada",
  CANCELLED: "Cancelada",
  EXPIRED: "Caducada",
};

function durationHours(snapshot: Pick<ShiftSnapshot, "startTime" | "endTime">) {
  const [startHour, startMinute] = snapshot.startTime.split(":").map(Number);
  const [endHour, endMinute] = snapshot.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 1440;
  return (end - start) / 60;
}

function shiftLabel(snapshot: ShiftSnapshot, proposal?: ShiftChange["proposal"]) {
  return `${proposal?.date ?? snapshot.date} · ${proposal?.startTime ?? snapshot.startTime}–${proposal?.endTime ?? snapshot.endTime}`;
}

function ShiftChangesView({ currentEmployeeId, canManage }: { currentEmployeeId: string; canManage: boolean }) {
  const [rows, setRows] = useState<ShiftChange[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setRows(await api.get<ShiftChange[]>(canManage ? "/api/planner/shift-changes/manage" : "/api/planner/shift-changes"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch(() => toast.error("No se pudieron cargar los cambios")); }, [canManage]);

  async function act(id: string, action: string) {
    try {
      await api.post(`/api/planner/shift-changes/${id}/${action}`, {});
      toast.success("Solicitud actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      await load();
    }
  }

  if (loading) return <div className="py-16 text-center text-muted-foreground">Cargando cambios de turno…</div>;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">{canManage ? "Bandeja de cambios" : "Mis cambios de turno"}</h2>
          <p className="text-sm text-muted-foreground">{canManage ? "Revisa restricciones antes de aprobar." : "Solicitudes enviadas y recibidas."}</p>
        </div>
        <button onClick={load} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary"><RefreshCw size={16} /></button>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const originalHours = durationHours(row.originalSnapshot);
          const proposedHours = row.requestType === "TIME_CHANGE" || row.requestType === "OPEN_REQUEST"
            ? durationHours({
                ...row.originalSnapshot,
                startTime: row.proposal.startTime ?? row.originalSnapshot.startTime,
                endTime: row.proposal.endTime ?? row.originalSnapshot.endTime,
              })
            : originalHours;
          const counterpartHours = row.counterpartSnapshot ? durationHours(row.counterpartSnapshot) : 0;
          const impact = row.requestType === "TRANSFER"
            ? `${row.requesterName} −${originalHours.toFixed(1)} h · ${row.recipientName ?? "Receptor"} +${originalHours.toFixed(1)} h`
            : row.requestType === "SWAP"
              ? `${row.requesterName} ${(counterpartHours - originalHours) >= 0 ? "+" : ""}${(counterpartHours - originalHours).toFixed(1)} h · ${row.recipientName ?? "Receptor"} ${(originalHours - counterpartHours) >= 0 ? "+" : ""}${(originalHours - counterpartHours).toFixed(1)} h`
              : `${row.requesterName} ${(proposedHours - originalHours) >= 0 ? "+" : ""}${(proposedHours - originalHours).toFixed(1)} h`;
          return (
            <article key={row.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-400">{CHANGE_TYPE_LABELS[row.requestType]}</span>
                    <span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">{CHANGE_STATUS_LABELS[row.status] ?? row.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{row.requesterName}{row.recipientName ? ` → ${row.recipientName}` : " → Responsable"}</p>
                </div>
                <time className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString("es-ES")}</time>
              </div>
              <div className="mt-4 grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-lg bg-secondary/60 p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Antes</div><div className="mt-1 text-sm text-foreground">{shiftLabel(row.originalSnapshot)}</div></div>
                <ArrowRightLeft className="mx-auto text-violet-400" size={18} />
                <div className="rounded-lg bg-violet-500/5 p-3"><div className="text-[10px] font-bold uppercase text-violet-400">Después</div><div className="mt-1 text-sm text-foreground">{row.requestType === "SWAP" && row.counterpartSnapshot ? `Intercambia con ${shiftLabel(row.counterpartSnapshot)}` : shiftLabel(row.originalSnapshot, row.proposal)}</div></div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">Impacto semanal: {impact}.</div>
              {row.requesterComment && <p className="mt-2 text-sm text-muted-foreground">“{row.requesterComment}”</p>}
              {row.managerComment && <p className="mt-2 text-sm text-amber-400">Responsable: {row.managerComment}</p>}
              {Array.isArray(row.validationIssues) && row.validationIssues.length > 0 && (
                <div className="mt-3 space-y-1 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  {row.validationIssues.map((issue, index) => <p key={`${issue.code}-${index}`} className="text-xs text-red-400">{issue.message}</p>)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {row.status === "PENDING_RECIPIENT" && row.recipientId === currentEmployeeId && <>
                  <button onClick={() => act(row.id, "reject")} className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400">Rechazar</button>
                  <button onClick={() => act(row.id, "accept")} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white">Aceptar</button>
                </>}
                {["PENDING_RECIPIENT", "PENDING_MANAGER"].includes(row.status) && row.requesterId === currentEmployeeId && (
                  <button onClick={() => act(row.id, "cancel")} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancelar</button>
                )}
                {canManage && row.status === "PENDING_MANAGER" && <>
                  <button onClick={() => act(row.id, "manager-reject")} className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400">Rechazar</button>
                  <button onClick={() => act(row.id, "approve")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Aprobar y validar</button>
                </>}
              </div>
            </article>
          );
        })}
        {!rows.length && <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No hay solicitudes de cambio.</div>}
      </div>
    </div>
  );
}

function ShiftChangeForm({ shift, onClose, onSaved }: { shift: Shift & { id: string }; onClose: () => void; onSaved: () => void }) {
  const [options, setOptions] = useState<{ employees: Employee[]; shifts: Array<ShiftSnapshot> }>({ employees: [], shifts: [] });
  const [form, setForm] = useState({
    requestType: "TRANSFER" as ShiftChange["requestType"],
    recipientId: "",
    counterpartShiftId: "",
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    comment: "",
  });
  useEffect(() => {
    api.get<typeof options>(`/api/planner/shift-changes/options/${shift.id}`)
      .then(setOptions)
      .catch((error) => toast.error(error instanceof Error ? error.message : "No se pudieron cargar las opciones"));
  }, [shift.id]);
  const counterpartOptions = options.shifts.filter((candidate) => candidate.employeeId === form.recipientId);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const needsRecipient = ["SWAP", "TRANSFER"].includes(form.requestType);
    await api.post("/api/planner/shift-changes", {
      requestType: form.requestType,
      originalShiftId: shift.id,
      recipientId: needsRecipient ? form.recipientId : null,
      counterpartShiftId: form.requestType === "SWAP" ? form.counterpartShiftId : null,
      proposal: ["TIME_CHANGE", "OPEN_REQUEST"].includes(form.requestType)
        ? { date: form.date, startTime: form.startTime, endTime: form.endTime }
        : {},
      comment: form.comment || null,
    });
    toast.success("Solicitud enviada");
    onSaved();
  }
  return <Modal title="Solicitar cambio de turno" onClose={onClose}><form onSubmit={submit} className="space-y-3"><div className="rounded-lg bg-secondary/60 p-3 text-sm text-foreground">{shift.date} · {shift.startTime}–{shift.endTime}</div><select className={inputClass} value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value as ShiftChange["requestType"], recipientId: "", counterpartShiftId: "" })}><option value="TRANSFER">Ceder a otro empleado</option><option value="SWAP">Intercambiar turnos</option><option value="TIME_CHANGE">Solicitar cambio de horario</option><option value="OPEN_REQUEST">Solicitar cambio al responsable</option></select>{["SWAP", "TRANSFER"].includes(form.requestType) && <select required className={inputClass} value={form.recipientId} onChange={(e) => setForm({ ...form, recipientId: e.target.value, counterpartShiftId: "" })}><option value="">Empleado receptor</option>{options.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>}{form.requestType === "SWAP" && <select required className={inputClass} value={form.counterpartShiftId} onChange={(e) => setForm({ ...form, counterpartShiftId: e.target.value })}><option value="">Turno a intercambiar</option>{counterpartOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.date} · {candidate.startTime}–{candidate.endTime}</option>)}</select>}{["TIME_CHANGE", "OPEN_REQUEST"].includes(form.requestType) && <><input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /><div className="grid grid-cols-2 gap-2"><input type="time" className={inputClass} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /><input type="time" className={inputClass} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div></>}<textarea className={inputClass} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Motivo o comentario" /><button className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white">Enviar solicitud</button></form></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-foreground">{title}</h2><button onClick={onClose} className="text-muted-foreground">✕</button></div>{children}</div></div>;
}
const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

function ScheduleForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const start = monday(new Date());
  const [form, setForm] = useState({ name: `Semana ${iso(start)}`, dateFrom: iso(start), dateTo: iso(addDays(start, 6)) });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const schedule = await api.post<Schedule>("/api/planner/schedules", form);
    toast.success("Periodo creado como borrador");
    onCreated(schedule.id);
  }
  return <Modal title="Nuevo periodo" onClose={onClose}><form onSubmit={submit} className="space-y-3"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" /><div className="grid grid-cols-2 gap-2"><input type="date" className={inputClass} value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} /><input type="date" className={inputClass} value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} /></div><button className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white">Crear borrador</button></form></Modal>;
}

function NeedForm({ schedule, positions, onClose, onSaved }: { schedule: Schedule; positions: Position[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ requirementDate: schedule.dateFrom, startTime: "12:00", endTime: "17:00", positionId: positions[0]?.id ?? "", requiredCount: 1 });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api.post(`/api/planner/schedules/${schedule.id}/requirements`, form);
    toast.success("Necesidad añadida");
    onSaved();
  }
  return <Modal title="Añadir necesidad" onClose={onClose}><form onSubmit={submit} className="space-y-3"><input type="date" min={schedule.dateFrom} max={schedule.dateTo} className={inputClass} value={form.requirementDate} onChange={(e) => setForm({ ...form, requirementDate: e.target.value })} /><div className="grid grid-cols-2 gap-2"><input type="time" className={inputClass} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /><input type="time" className={inputClass} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div><select required className={inputClass} value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })}><option value="">Seleccionar puesto</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select><input type="number" min={1} className={inputClass} value={form.requiredCount} onChange={(e) => setForm({ ...form, requiredCount: Number(e.target.value) })} /><button className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white">Guardar necesidad</button></form></Modal>;
}

function ShiftForm({ context, shift, onClose, onSaved }: { context: Context; shift: Shift; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ employeeId: shift.employeeId, requirementId: shift.requirementId ?? null, positionId: shift.positionId ?? context.positions[0]?.id ?? "", shiftDate: shift.date, startTime: shift.startTime, endTime: shift.endTime, notes: shift.notes ?? "" });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = shift.id
      ? await api.put<{ issues: Issue[] }>(`/api/planner/assignments/${shift.id}`, form)
      : await api.post<{ issues: Issue[] }>(`/api/planner/schedules/${context.schedule.id}/assignments`, form);
    result.issues.length ? toast.warning(`Cambio guardado con ${result.issues.length} incidencia(s)`) : toast.success("Asignación actualizada");
    onSaved();
  }
  async function remove() {
    if (!shift.id) return;
    await api.delete(`/api/planner/assignments/${shift.id}`);
    toast.success("Asignación eliminada");
    onSaved();
  }
  return <Modal title={shift.id ? "Editar asignación" : "Nueva asignación manual"} onClose={onClose}><form onSubmit={submit} className="space-y-3"><select className={inputClass} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>{context.employeeRows.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select><select className={inputClass} value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })}>{context.positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select><input type="date" className={inputClass} value={form.shiftDate} onChange={(e) => setForm({ ...form, shiftDate: e.target.value })} /><div className="grid grid-cols-2 gap-2"><input type="time" className={inputClass} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /><input type="time" className={inputClass} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div><div className="flex gap-2">{shift.id && <button type="button" onClick={remove} className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400">Eliminar</button>}<button className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white">Guardar y validar</button></div></form></Modal>;
}
