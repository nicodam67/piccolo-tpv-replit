import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Copy, Plus, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api-client";

type RuleType = "AVAILABLE" | "UNAVAILABLE" | "PREFERRED" | "UNDESIRED";
interface Rule {
  availabilityType: RuleType;
  availabilityDate?: string | null;
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  reason?: string | null;
}
interface Profile {
  maxWeeklyMinutes?: number | null;
  minRestMinutes: number;
  allowsSplitShift: boolean;
  workingDays: number[];
  preferredWindows: Array<{
    type: "PREFERRED" | "UNDESIRED";
    dayOfWeek?: number | null;
    date?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
  }>;
  restrictions: Record<string, unknown>;
}
interface PlanningEmployeeSummary {
  id: string;
  name: string;
  lastName?: string | null;
  weeklyHours?: string | null;
  primaryPositionId?: string | null;
  positionName?: string | null;
  workCenterName?: string | null;
  availableWeeklyMinutes: number;
  maxWeeklyMinutes?: number | null;
  exceptionCount: number;
}
interface PlanningDetail {
  employee: PlanningEmployeeSummary & {
    contractType?: string | null;
    departmentName?: string | null;
    workCenterId?: string | null;
  };
  profile: Profile;
  availability: Array<Rule & { id: string }>;
  positionIds: string[];
  approvedAbsences: Array<{ dateFrom: string; dateTo: string; type: string }>;
  timezone: string;
  summary: {
    contractedWeeklyMinutes?: number | null;
    availableWeeklyMinutes: number;
    upcomingExceptions: number;
  };
}
interface Position { id: string; name: string; }
interface TeamDay { date: string; approvedAbsence: boolean; rules: Array<{ type: RuleType; startTime?: string | null; endTime?: string | null }>; }
interface TeamEmployee { id: string; name: string; days: TeamDay[]; }

const DAYS = [
  { day: 1, label: "Lunes" },
  { day: 2, label: "Martes" },
  { day: 3, label: "Miércoles" },
  { day: 4, label: "Jueves" },
  { day: 5, label: "Viernes" },
  { day: 6, label: "Sábado" },
  { day: 0, label: "Domingo" },
];
const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

function minutes(start?: string | null, end?: string | null) {
  if (!start && !end) return 1_440;
  if (!start || !end || start === end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const from = sh * 60 + sm;
  let to = eh * 60 + em;
  if (to <= from) to += 1_440;
  return to - from;
}

function monday(value: Date) {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function addDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function fullName(employee: Pick<PlanningEmployeeSummary, "name" | "lastName">) {
  return `${employee.name} ${employee.lastName ?? ""}`.trim();
}

export default function AvailabilityPlanner({ currentEmployeeId, canManage }: {
  currentEmployeeId: string;
  canManage: boolean;
}) {
  const [mode, setMode] = useState<"employee" | "team">("employee");
  const [employees, setEmployees] = useState<PlanningEmployeeSummary[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedId, setSelectedId] = useState(currentEmployeeId);
  const [detail, setDetail] = useState<PlanningDetail | null>(null);
  const [weeklyRules, setWeeklyRules] = useState<Rule[]>([]);
  const [exceptions, setExceptions] = useState<Rule[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [primaryPositionId, setPrimaryPositionId] = useState("");
  const [duplicateSource, setDuplicateSource] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadList() {
    if (!canManage) return;
    const result = await api.get<{ employees: PlanningEmployeeSummary[]; positions: Position[] }>("/api/planner/planning-employees");
    setEmployees(result.employees);
    setPositions(result.positions);
    setSelectedId((current) => current || result.employees[0]?.id || "");
  }
  async function loadDetail(id = selectedId) {
    if (!id) return;
    setLoading(true);
    try {
      const result = await api.get<PlanningDetail>(canManage
        ? `/api/planner/employees/${id}/planning`
        : "/api/planner/employees/me/planning");
      setDetail(result);
      setWeeklyRules(result.availability.filter((rule) =>
        rule.dayOfWeek != null && !rule.availabilityDate && !rule.validFrom && !rule.validTo,
      ));
      setExceptions(result.availability.filter((rule) =>
        Boolean(rule.availabilityDate || (rule.dayOfWeek == null && (rule.validFrom || rule.validTo))),
      ));
      setProfile({
        maxWeeklyMinutes: result.profile.maxWeeklyMinutes,
        minRestMinutes: result.profile.minRestMinutes,
        allowsSplitShift: result.profile.allowsSplitShift,
        workingDays: Array.isArray(result.profile.workingDays) ? result.profile.workingDays : [0, 1, 2, 3, 4, 5, 6],
        preferredWindows: Array.isArray(result.profile.preferredWindows) ? result.profile.preferredWindows : [],
        restrictions: result.profile.restrictions ?? {},
      });
      setPositionIds(result.positionIds);
      setPrimaryPositionId(result.employee.primaryPositionId ?? result.positionIds[0] ?? "");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    (async () => {
      if (canManage) await loadList();
      else setSelectedId(currentEmployeeId);
    })().catch(() => toast.error("No se pudieron cargar los empleados"));
  }, [canManage, currentEmployeeId]);
  useEffect(() => { if (selectedId) loadDetail(selectedId).catch(() => toast.error("No se pudo cargar la disponibilidad")); }, [selectedId]);

  const errors = useMemo(() => {
    const result: string[] = [];
    for (const { day, label } of DAYS) {
      const rules = weeklyRules.filter((rule) => rule.dayOfWeek === day);
      if (rules.some((rule) => rule.availabilityType === "UNAVAILABLE" && !rule.startTime) && rules.length > 1) {
        result.push(`${label}: un día no disponible no puede tener franjas.`);
      }
      const windows = rules.filter((rule) => rule.availabilityType === "AVAILABLE");
      windows.forEach((window) => {
        if (!window.startTime || !window.endTime || window.startTime === window.endTime) result.push(`${label}: revisa las horas de la franja.`);
      });
      for (let left = 0; left < windows.length; left++) {
        for (let right = left + 1; right < windows.length; right++) {
          const a = windows[left]!;
          const b = windows[right]!;
          const bounds = (rule: Rule) => {
            const [sh, sm] = rule.startTime!.split(":").map(Number);
            const [eh, em] = rule.endTime!.split(":").map(Number);
            const start = sh * 60 + sm;
            let end = eh * 60 + em;
            if (end <= start) end += 1_440;
            return [start, end];
          };
          const [as, ae] = bounds(a);
          const [bs, be] = bounds(b);
          if (as < be && bs < ae) result.push(`${label}: hay franjas solapadas.`);
        }
      }
      if (windows.length > 0 && profile && !profile.workingDays.includes(day)) {
        result.push(`${label}: hay disponibilidad pero no es un día laborable permitido.`);
      }
    }
    [...exceptions, ...(profile?.preferredWindows ?? []).map((rule) => ({
      availabilityType: rule.type,
      startTime: rule.startTime,
      endTime: rule.endTime,
    } as Rule))].forEach((rule) => {
      if (Boolean(rule.startTime) !== Boolean(rule.endTime) || (rule.startTime && rule.startTime === rule.endTime)) {
        result.push("Las franjas deben tener inicio y fin distintos.");
      }
    });
    const contracted = detail?.summary.contractedWeeklyMinutes;
    if (profile?.maxWeeklyMinutes != null && contracted != null && profile.maxWeeklyMinutes < contracted) {
      result.push("El máximo semanal no puede ser inferior a las horas contratadas.");
    }
    if (!positionIds.length) result.push("Selecciona al menos un puesto compatible.");
    if (primaryPositionId && !positionIds.includes(primaryPositionId)) result.push("El puesto principal debe ser compatible.");
    return [...new Set(result)];
  }, [weeklyRules, exceptions, profile, positionIds, primaryPositionId, detail]);

  const availableMinutes = weeklyRules
    .filter((rule) => rule.availabilityType === "AVAILABLE")
    .reduce((total, rule) => total + minutes(rule.startTime, rule.endTime), 0);

  function setDayMode(day: number, mode: "ALL" | "OFF" | "WINDOWS") {
    setWeeklyRules((rules) => [
      ...rules.filter((rule) => rule.dayOfWeek !== day),
      ...(mode === "ALL" ? [{ availabilityType: "AVAILABLE" as const, dayOfWeek: day }] : []),
      ...(mode === "OFF" ? [{ availabilityType: "UNAVAILABLE" as const, dayOfWeek: day }] : []),
      ...(mode === "WINDOWS" ? [{ availabilityType: "AVAILABLE" as const, dayOfWeek: day, startTime: "12:00", endTime: "16:00" }] : []),
    ]);
  }
  function copyMonday() {
    const mondayRules = weeklyRules.filter((rule) => rule.dayOfWeek === 1);
    setWeeklyRules(DAYS.flatMap(({ day }) => mondayRules.map((rule) => ({ ...rule, dayOfWeek: day }))));
  }
  function copyWeekToExceptions() {
    const start = monday(new Date());
    const copied = DAYS.flatMap(({ day }, index) =>
      weeklyRules.filter((rule) => rule.dayOfWeek === day).map((rule) => ({
        ...rule,
        dayOfWeek: null,
        availabilityDate: addDate(start, index),
      })),
    );
    setExceptions((current) => [...current, ...copied]);
    toast.success("Semana copiada como excepciones fechadas");
  }
  async function duplicate() {
    if (!duplicateSource || !selectedId) return;
    await api.post(`/api/planner/employees/${selectedId}/planning/duplicate`, { sourceEmployeeId: duplicateSource });
    toast.success("Configuración duplicada");
    await loadDetail();
  }
  async function save() {
    if (!profile || errors.length || !selectedId) return;
    await api.put(`/api/planner/employees/${selectedId}/planning`, {
      profile,
      weeklyRules,
      exceptions: exceptions.map((rule) => ({
        ...rule,
        validFrom: rule.availabilityDate ? null : rule.validFrom,
        validTo: rule.availabilityDate ? null : rule.validTo,
      })),
      positionIds,
      primaryPositionId,
    });
    toast.success("Disponibilidad y perfil guardados");
    await Promise.all([loadDetail(), loadList()]);
  }

  if (loading && !detail) return <div className="py-20 text-center text-muted-foreground">Cargando disponibilidad…</div>;
  if (mode === "team" && canManage) return <TeamAvailability onBack={() => setMode("employee")} />;
  if (!detail || !profile) return <div className="py-20 text-center text-muted-foreground">No hay empleado disponible.</div>;

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
      {canManage && (
        <aside className="rounded-xl border border-border bg-card p-3">
          <button onClick={() => setMode("team")} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white"><Users size={16} /> Vista del equipo</button>
          <div className="space-y-1">
            {employees.map((employee) => <button key={employee.id} onClick={() => setSelectedId(employee.id)} className={`w-full rounded-lg p-2 text-left ${selectedId === employee.id ? "bg-violet-500/15" : "hover:bg-secondary"}`}><div className="text-sm font-medium text-foreground">{fullName(employee)}</div><div className="mt-1 text-xs text-muted-foreground">{Math.round(employee.availableWeeklyMinutes / 60)} h disponibles · {employee.positionName ?? "Sin puesto"}</div></button>)}
          </div>
        </aside>
      )}
      <main className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{fullName(detail.employee)}</h2>
              <p className="text-sm text-muted-foreground">{detail.employee.positionName ?? "Sin puesto"} · {detail.employee.workCenterName ?? "Sin centro"} · Zona {detail.timezone}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div><div className="text-lg font-bold text-violet-400">{Math.round(availableMinutes / 60)} h</div><div className="text-muted-foreground">Disponible</div></div>
              <div><div className="text-lg font-bold text-foreground">{Math.round((detail.summary.contractedWeeklyMinutes ?? 0) / 60)} h</div><div className="text-muted-foreground">Objetivo</div></div>
              <div><div className="text-lg font-bold text-amber-400">{exceptions.length}</div><div className="text-muted-foreground">Excepciones</div></div>
            </div>
          </div>
          {canManage && <div className="mt-4 flex flex-wrap gap-2"><select className={inputClass} value={duplicateSource} onChange={(event) => setDuplicateSource(event.target.value)}><option value="">Duplicar desde…</option>{employees.filter((employee) => employee.id !== selectedId).map((employee) => <option key={employee.id} value={employee.id}>{fullName(employee)}</option>)}</select><button onClick={duplicate} disabled={!duplicateSource} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground disabled:opacity-40"><Copy size={15} /> Duplicar configuración</button></div>}
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4"><div><h3 className="font-semibold text-foreground">Disponibilidad semanal</h3><p className="text-xs text-muted-foreground">Restricción obligatoria: el generador nunca asignará fuera de estas franjas.</p></div>{canManage && <div className="flex gap-2"><button onClick={copyMonday} className="rounded-lg border border-border px-3 py-2 text-xs text-foreground">Copiar lunes</button><button onClick={copyWeekToExceptions} className="rounded-lg border border-border px-3 py-2 text-xs text-foreground">Copiar semana</button><button onClick={() => setWeeklyRules(DAYS.map(({ day }) => ({ availabilityType: "UNAVAILABLE", dayOfWeek: day })))} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400">Limpiar</button></div>}</div>
          <div className="divide-y divide-border">
            {DAYS.map(({ day, label }) => {
              const rules = weeklyRules.filter((rule) => rule.dayOfWeek === day);
              const mode = rules.length === 0 ? "ALL" : rules.some((rule) => rule.availabilityType === "UNAVAILABLE" && !rule.startTime)
                ? "OFF" : rules.some((rule) => rule.availabilityType === "AVAILABLE" && !rule.startTime) ? "ALL" : "WINDOWS";
              return <div key={day} className="grid gap-3 p-3 md:grid-cols-[130px_170px_1fr]"><div className="font-medium text-foreground">{label}</div><select disabled={!canManage} className={inputClass} value={mode} onChange={(event) => setDayMode(day, event.target.value as "ALL" | "OFF" | "WINDOWS")}><option value="ALL">Todo el día</option><option value="OFF">No disponible</option><option value="WINDOWS">Por franjas</option></select><div className="flex flex-wrap gap-2">{mode === "WINDOWS" && rules.filter((rule) => rule.availabilityType === "AVAILABLE").map((rule, index) => <div key={index} className="flex items-center gap-1"><input disabled={!canManage} type="time" className={inputClass} value={rule.startTime ?? ""} onChange={(event) => setWeeklyRules((current) => current.map((item) => item === rule ? { ...item, startTime: event.target.value } : item))} /><span className="text-muted-foreground">–</span><input disabled={!canManage} type="time" className={inputClass} value={rule.endTime ?? ""} onChange={(event) => setWeeklyRules((current) => current.map((item) => item === rule ? { ...item, endTime: event.target.value } : item))} />{canManage && <button onClick={() => setWeeklyRules((current) => current.filter((item) => item !== rule))} className="p-2 text-red-400"><Trash2 size={15} /></button>}</div>)}{mode === "WINDOWS" && canManage && <button onClick={() => setWeeklyRules((current) => [...current, { availabilityType: "AVAILABLE", dayOfWeek: day, startTime: "19:00", endTime: "23:00" }])} className="p-2 text-violet-400"><Plus size={16} /></button>}</div></div>;
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-foreground">Excepciones por fecha</h3><p className="text-xs text-muted-foreground">Prevalecen sobre la semana. Las ausencias aprobadas siguen teniendo prioridad absoluta.</p></div>{canManage && <button onClick={() => setExceptions((current) => [...current, { availabilityType: "UNAVAILABLE", availabilityDate: new Date().toISOString().slice(0, 10) }])} className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs text-white"><Plus size={14} /> Añadir</button>}</div>
          <div className="space-y-2">{exceptions.map((rule, index) => <div key={index} className="grid gap-2 rounded-lg bg-secondary/50 p-3 md:grid-cols-[130px_1fr_1fr_110px_110px_1fr_auto]"><select disabled={!canManage} className={inputClass} value={rule.availabilityType} onChange={(event) => setExceptions((current) => current.map((item) => item === rule ? { ...item, availabilityType: event.target.value as RuleType } : item))}><option value="AVAILABLE">Disponible</option><option value="UNAVAILABLE">No disponible</option></select><input disabled={!canManage} aria-label="Fecha inicial de excepción" type="date" className={inputClass} value={rule.availabilityDate ?? rule.validFrom ?? ""} onChange={(event) => setExceptions((current) => current.map((item) => item === rule ? { ...item, availabilityDate: null, validFrom: event.target.value, validTo: event.target.value } : item))} /><input disabled={!canManage} aria-label="Fecha final de excepción" type="date" className={inputClass} value={rule.validTo ?? rule.availabilityDate ?? ""} onChange={(event) => setExceptions((current) => current.map((item) => item === rule ? { ...item, availabilityDate: null, validTo: event.target.value } : item))} /><input disabled={!canManage} aria-label="Inicio de excepción" type="time" className={inputClass} value={rule.startTime ?? ""} onChange={(event) => setExceptions((current) => current.map((item) => item === rule ? { ...item, startTime: event.target.value || null, endTime: event.target.value ? item.endTime ?? "23:00" : null } : item))} /><input disabled={!canManage} aria-label="Fin de excepción" type="time" className={inputClass} value={rule.endTime ?? ""} onChange={(event) => setExceptions((current) => current.map((item) => item === rule ? { ...item, endTime: event.target.value || null, startTime: event.target.value ? item.startTime ?? "12:00" : null } : item))} /><input disabled={!canManage} className={inputClass} placeholder="Motivo" value={rule.reason ?? ""} onChange={(event) => setExceptions((current) => current.map((item) => item === rule ? { ...item, reason: event.target.value } : item))} />{canManage && <button onClick={() => setExceptions((current) => current.filter((item) => item !== rule))} className="p-2 text-red-400"><Trash2 size={16} /></button>}</div>)}</div>
          {detail.approvedAbsences.length > 0 && <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">{detail.approvedAbsences.length} ausencia(s) aprobada(s) bloquean la planificación y no se editan aquí.</div>}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-red-500/20 bg-card p-4"><h3 className="font-semibold text-foreground">Obligatorio</h3><p className="mb-4 text-xs text-muted-foreground">Estas reglas invalidan una asignación.</p><div className="space-y-3"><label className="block text-xs text-muted-foreground">Horas contratadas/objetivo<input disabled className={`${inputClass} mt-1 w-full`} value={`${(detail.summary.contractedWeeklyMinutes ?? 0) / 60} h`} /></label><label className="block text-xs text-muted-foreground">Máximo semanal<input disabled={!canManage} type="number" className={`${inputClass} mt-1 w-full`} value={(profile.maxWeeklyMinutes ?? 0) / 60} onChange={(event) => setProfile({ ...profile, maxWeeklyMinutes: Number(event.target.value) * 60 })} /></label><label className="block text-xs text-muted-foreground">Descanso mínimo<input disabled={!canManage} type="number" className={`${inputClass} mt-1 w-full`} value={profile.minRestMinutes / 60} onChange={(event) => setProfile({ ...profile, minRestMinutes: Number(event.target.value) * 60 })} /></label><label className="flex items-center gap-2 text-sm text-foreground"><input disabled={!canManage} type="checkbox" checked={profile.allowsSplitShift} onChange={(event) => setProfile({ ...profile, allowsSplitShift: event.target.checked })} /> Permitir turno partido</label><div><div className="mb-1 text-xs text-muted-foreground">Días laborables permitidos</div><div className="flex flex-wrap gap-2">{DAYS.map(({ day, label }) => <label key={day} className="flex items-center gap-1 text-xs text-foreground"><input disabled={!canManage} type="checkbox" checked={profile.workingDays.includes(day)} onChange={(event) => setProfile({ ...profile, workingDays: event.target.checked ? [...profile.workingDays, day] : profile.workingDays.filter((item) => item !== day) })} />{label.slice(0, 3)}</label>)}</div></div></div></div>
          <div className="rounded-xl border border-violet-500/20 bg-card p-4"><h3 className="font-semibold text-foreground">Preferencias</h3><p className="mb-4 text-xs text-muted-foreground">Orientan la elección entre asignaciones válidas; no invalidan un turno.</p><div className="space-y-2">{profile.preferredWindows.map((rule, index) => <div key={index} className="grid grid-cols-[110px_110px_1fr_1fr_auto] gap-1"><select disabled={!canManage} className={inputClass} value={rule.type} onChange={(event) => setProfile({ ...profile, preferredWindows: profile.preferredWindows.map((item) => item === rule ? { ...item, type: event.target.value as "PREFERRED" | "UNDESIRED" } : item) })}><option value="PREFERRED">Preferida</option><option value="UNDESIRED">No deseada</option></select><select disabled={!canManage} className={inputClass} value={rule.dayOfWeek ?? 1} onChange={(event) => setProfile({ ...profile, preferredWindows: profile.preferredWindows.map((item) => item === rule ? { ...item, dayOfWeek: Number(event.target.value) } : item) })}>{DAYS.map(({ day, label }) => <option key={day} value={day}>{label.slice(0, 3)}</option>)}</select><input disabled={!canManage} type="time" className={inputClass} value={rule.startTime ?? ""} onChange={(event) => setProfile({ ...profile, preferredWindows: profile.preferredWindows.map((item) => item === rule ? { ...item, startTime: event.target.value } : item) })} /><input disabled={!canManage} type="time" className={inputClass} value={rule.endTime ?? ""} onChange={(event) => setProfile({ ...profile, preferredWindows: profile.preferredWindows.map((item) => item === rule ? { ...item, endTime: event.target.value } : item) })} />{canManage && <button onClick={() => setProfile({ ...profile, preferredWindows: profile.preferredWindows.filter((item) => item !== rule) })} className="text-red-400"><Trash2 size={15} /></button>}</div>)}{canManage && <button onClick={() => setProfile({ ...profile, preferredWindows: [...profile.preferredWindows, { type: "PREFERRED", dayOfWeek: 1, startTime: "18:00", endTime: "23:00" }] })} className="flex items-center gap-1 text-xs text-violet-400"><Plus size={14} /> Añadir franja preferida</button>}</div></div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4"><h3 className="font-semibold text-foreground">Puestos compatibles</h3><div className="mt-3 flex flex-wrap gap-3">{positions.map((position) => <label key={position.id} className="flex items-center gap-1 text-sm text-foreground"><input disabled={!canManage} type="checkbox" checked={positionIds.includes(position.id)} onChange={(event) => setPositionIds(event.target.checked ? [...positionIds, position.id] : positionIds.filter((id) => id !== position.id))} />{position.name}</label>)}</div><select disabled={!canManage} className={`${inputClass} mt-3`} value={primaryPositionId} onChange={(event) => setPrimaryPositionId(event.target.value)}><option value="">Puesto principal</option>{positions.filter((position) => positionIds.includes(position.id)).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></section>

        {errors.length > 0 && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4"><div className="flex items-center gap-2 font-semibold text-red-400"><AlertTriangle size={17} /> Corrige antes de guardar</div>{errors.map((error) => <p key={error} className="mt-1 text-sm text-red-300">{error}</p>)}</div>}
        {canManage && <button onClick={save} disabled={errors.length > 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40"><Save size={17} /> Guardar disponibilidad y perfil</button>}
      </main>
    </div>
  );
}

function TeamAvailability({ onBack }: { onBack: () => void }) {
  const [weekStart, setWeekStart] = useState(() => monday(new Date()));
  const [data, setData] = useState<{ dates: string[]; timezone: string; employees: TeamEmployee[] } | null>(null);
  useEffect(() => {
    api.get<typeof data>(`/api/planner/availability/team?weekStart=${weekStart}`)
      .then(setData)
      .catch(() => toast.error("No se pudo cargar la vista del equipo"));
  }, [weekStart]);
  return <div className="xl:col-span-2"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><button onClick={onBack} className="mb-2 text-sm text-violet-400">← Volver al empleado</button><h2 className="text-lg font-semibold text-foreground">Disponibilidad del equipo</h2><p className="text-sm text-muted-foreground">Semana local · {data?.timezone ?? "…"}</p></div><div className="flex items-center gap-2"><button onClick={() => setWeekStart(addDate(weekStart, -7))} className="rounded-lg border border-border px-3 py-2">←</button><input type="date" className={inputClass} value={weekStart} onChange={(event) => setWeekStart(monday(new Date(`${event.target.value}T12:00:00Z`)))} /><button onClick={() => setWeekStart(addDate(weekStart, 7))} className="rounded-lg border border-border px-3 py-2">→</button></div></div><div className="overflow-x-auto rounded-xl border border-border bg-card"><div className="grid min-w-[1000px] grid-cols-[180px_repeat(7,1fr)]"><div className="border-b border-r border-border p-3 font-semibold">Empleado</div>{data?.dates.map((date) => <div key={date} className="border-b border-r border-border p-3 text-center text-xs text-muted-foreground">{new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}</div>)}{data?.employees.map((employee) => <div key={employee.id} className="contents"><div className="border-b border-r border-border p-3 text-sm font-medium text-foreground">{employee.name}</div>{employee.days.map((day) => <div key={day.date} className={`border-b border-r border-border p-2 text-xs ${day.approvedAbsence ? "bg-red-500/10 text-red-400" : "text-foreground"}`}>{day.approvedAbsence ? "Ausencia aprobada" : day.rules.length === 0 ? "Todo el día" : day.rules.map((rule, index) => <div key={index} className={rule.type === "UNAVAILABLE" ? "text-red-400" : "text-emerald-400"}>{rule.type === "UNAVAILABLE" ? "No disponible" : "Disponible"}{rule.startTime ? ` ${rule.startTime}–${rule.endTime}` : " todo el día"}</div>)}</div>)}</div>)}</div></div><div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CalendarRange size={14} /> Las ausencias aprobadas prevalecen sobre cualquier excepción.</div></div>;
}
