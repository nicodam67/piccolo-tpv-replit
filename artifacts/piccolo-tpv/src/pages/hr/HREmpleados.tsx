import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, X, ChevronRight, User, Phone, Mail, MapPin,
  Briefcase, Calendar, DollarSign, Key, Tag, Eye, EyeOff, Users,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Employee = {
  id: string; name: string; lastName?: string; role: string; active: boolean;
  empStatus: string; employeeNumber?: string; email?: string; phone?: string;
  dni?: string; address?: string; hireDate?: string; terminationDate?: string;
  positionId?: string; departmentId?: string; workCenterId?: string;
  contractType?: string; weeklyHours?: string; hourlyRate?: string;
  monthlySalary?: string; employerCostRate?: string;
  externalCode?: string; photoUrl?: string; emergencyContact?: Record<string, string>;
  empNotes?: string; anvizId?: string; nfcId?: string;
  positions?: Array<{ position?: { id: string; name: string } | null; isPrimary: boolean }>;
  externalIds?: Array<{ id: string; source: string; externalId: string; deviceId?: string }>;
};

type Position = { id: string; name: string; code: string; departmentId?: string };
type Department = { id: string; name: string; code: string };

const ROLES = ["admin", "manager", "encargado", "employee"] as const;
const CONTRACT_TYPES = [
  { value: "full_time", label: "Jornada completa" },
  { value: "part_time", label: "Jornada parcial" },
  { value: "hourly", label: "Por horas" },
];
const EMP_STATUSES = [
  { value: "active", label: "Activo", color: "text-green-400" },
  { value: "inactive", label: "Inactivo", color: "text-gray-400" },
  { value: "suspended", label: "Suspendido", color: "text-yellow-400" },
];

const INPUT = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500";

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

function StatusBadge({ status }: { status: string }) {
  const s = EMP_STATUSES.find((x) => x.value === status) ?? EMP_STATUSES[1]!;
  return <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>;
}

function Section({ title, Icon, children, action }: {
  title: string;
  Icon: React.FC<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Icon className="w-4 h-4 text-blue-400" />
          {title}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, value, Icon, className }: {
  label: string; value?: string | null;
  Icon?: React.FC<{ className?: string }>; className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      {value ? (
        <p className="text-sm flex items-center gap-1">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" />}
          {value}
        </p>
      ) : (
        <p className="text-sm text-gray-600 italic">—</p>
      )}
    </div>
  );
}

function FormField({ label, children, required, className }: {
  label: string; children: React.ReactNode; required?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const emptyForm = (): Partial<Employee> & { pin?: string } => ({
  name: "", lastName: "", role: "employee", active: true, empStatus: "active",
  contractType: "full_time", weeklyHours: "40", hourlyRate: "",
  employerCostRate: "1.35", pin: "",
});

export default function HREmpleados() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Employee> & { pin?: string }>(emptyForm());
  const [showEco, setShowEco] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["hr-employees", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`${BASE}/api/hr/employees?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Error cargando empleados");
      return res.json();
    },
    placeholderData: [],
  });

  const { data: selectedDetail } = useQuery<Employee>({
    queryKey: ["hr-employee", selected?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/hr/employees/${selected!.id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Error cargando empleado");
      return res.json();
    },
    enabled: !!selected?.id,
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["hr-positions"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/hr/positions`, { headers: authHeaders() });
      return res.json();
    },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["hr-departments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/hr/departments`, { headers: authHeaders() });
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Employee> & { pin?: string }) => {
      const method = editMode && selected ? "PATCH" : "POST";
      const url = editMode && selected
        ? `${BASE}/api/hr/employees/${selected.id}`
        : `${BASE}/api/hr/employees`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error guardando");
      return res.json();
    },
    onSuccess: () => {
      toast.success(editMode ? "Empleado actualizado" : "Empleado creado");
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      setShowForm(false);
      setForm(emptyForm());
      setEditMode(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`${BASE}/api/hr/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ empStatus: status, active: status === "active" }),
      });
      if (!res.ok) throw new Error("Error actualizando estado");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      qc.invalidateQueries({ queryKey: ["hr-employee", selected?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setForm(emptyForm()); setEditMode(false); setShowForm(true); };
  const openEdit = (emp: Employee) => { setForm({ ...emp, pin: "" }); setEditMode(true); setShowForm(true); };
  const fullName = (e: Employee) => `${e.name} ${e.lastName ?? ""}`.trim();
  const detail = selectedDetail ?? selected;

  return (
    <div className="flex h-full overflow-hidden">
      {/* LIST */}
      <div className="w-80 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-3 border-b border-gray-800 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-2 bg-gray-800 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button onClick={openCreate} className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="p-2 border-b border-gray-800">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full py-1.5 px-2 bg-gray-800 rounded text-xs border border-gray-700 focus:outline-none">
            <option value="">Todos los estados</option>
            {EMP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-center text-gray-500 text-sm">Cargando...</p>
          ) : employees.length === 0 ? (
            <p className="p-4 text-center text-gray-500 text-sm">Sin resultados</p>
          ) : (
            employees.map((emp) => (
              <button key={emp.id} onClick={() => setSelected(emp)}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-800 border-b border-gray-800/50 transition-colors ${selected?.id === emp.id ? "bg-gray-800" : ""}`}>
                <div className="w-9 h-9 rounded-full bg-blue-900/60 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-blue-300">{emp.name[0]}{(emp.lastName ?? "")[0] ?? ""}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{fullName(emp)}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 capitalize">{emp.role}</span>
                    <StatusBadge status={emp.empStatus} />
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* DETAIL */}
      <div className="flex-1 overflow-y-auto bg-gray-950">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Selecciona un empleado</p></div>
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-900/60 flex items-center justify-center text-2xl font-bold text-blue-300">
                  {selected.name[0]}{(selected.lastName ?? "")[0] ?? ""}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{fullName(detail ?? selected)}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-gray-400 capitalize">{selected.role}</span>
                    <StatusBadge status={(detail ?? selected).empStatus} />
                    {selected.employeeNumber && <span className="text-xs text-gray-500">#{selected.employeeNumber}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(detail ?? selected)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Editar</button>
                {(detail ?? selected).empStatus === "active" ? (
                  <button onClick={() => statusMutation.mutate({ id: selected.id, status: "suspended" })}
                    className="px-3 py-1.5 bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 rounded-lg text-sm">Suspender</button>
                ) : (
                  <button onClick={() => statusMutation.mutate({ id: selected.id, status: "active" })}
                    className="px-3 py-1.5 bg-green-900/40 text-green-400 hover:bg-green-900/60 rounded-lg text-sm">Activar</button>
                )}
              </div>
            </div>

            <Section title="Datos personales" Icon={User}>
              <Grid2>
                <Field label="Nombre completo" value={fullName(detail ?? selected)} />
                <Field label="DNI/NIE" value={selected.dni} />
                <Field label="Email" value={selected.email} Icon={Mail} />
                <Field label="Teléfono" value={selected.phone} Icon={Phone} />
                <Field label="Dirección" value={selected.address} Icon={MapPin} className="col-span-2" />
              </Grid2>
              {detail?.emergencyContact && (
                <div className="mt-3 p-3 bg-red-950/30 rounded-lg border border-red-900/30">
                  <p className="text-xs text-red-400 font-medium mb-1">Contacto de emergencia</p>
                  <p className="text-sm">{detail.emergencyContact["name"]} — {detail.emergencyContact["phone"]}</p>
                </div>
              )}
            </Section>

            <Section title="Datos laborales" Icon={Briefcase}>
              <Grid2>
                <Field label="Puesto" value={
                  selectedDetail?.positions?.find((p) => p.isPrimary)?.position?.name ??
                  positions.find((p) => p.id === selected.positionId)?.name
                } />
                <Field label="Departamento" value={departments.find((d) => d.id === selected.departmentId)?.name} />
                <Field label="Contrato" value={CONTRACT_TYPES.find((c) => c.value === selected.contractType)?.label} />
                <Field label="Jornada" value={selected.weeklyHours ? `${selected.weeklyHours} h/semana` : undefined} />
                <Field label="Fecha alta" value={selected.hireDate} Icon={Calendar} />
                <Field label="Fecha baja" value={selected.terminationDate} Icon={Calendar} />
                <Field label="N.º empleado" value={selected.employeeNumber} />
                <Field label="Código externo" value={selected.externalCode} Icon={Tag} />
              </Grid2>
            </Section>

            <Section title="Datos económicos" Icon={DollarSign}
              action={
                <button onClick={() => setShowEco((v) => !v)} className="p-1 text-gray-500 hover:text-gray-300">
                  {showEco ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }>
              {showEco ? (
                <Grid2>
                  <Field label="Coste/hora" value={selected.hourlyRate ? `${selected.hourlyRate} €/h` : undefined} />
                  <Field label="Salario mensual" value={selected.monthlySalary ? `${selected.monthlySalary} €/mes` : undefined} />
                  <Field label="Coeficiente empresa" value={selected.employerCostRate ? `×${selected.employerCostRate}` : undefined} />
                </Grid2>
              ) : (
                <p className="text-sm text-gray-500 italic">Datos ocultos — haz clic en el ojo para ver</p>
              )}
            </Section>

            <Section title="TPV e identificadores" Icon={Key}>
              <Grid2>
                <Field label="ID Anviz" value={selected.anvizId} />
                <Field label="ID NFC" value={selected.nfcId} />
              </Grid2>
              {selectedDetail?.externalIds && selectedDetail.externalIds.length > 0 && (
                <div className="mt-3 space-y-1">
                  {selectedDetail.externalIds.map((ext) => (
                    <div key={ext.id} className="flex items-center gap-2 text-sm bg-gray-800 rounded px-3 py-2">
                      <Tag className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-gray-400 capitalize">{ext.source}:</span>
                      <span className="font-mono">{ext.externalId}</span>
                      {ext.deviceId && <span className="text-gray-500 text-xs">({ext.deviceId})</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {(detail?.empNotes) && (
              <Section title="Observaciones" Icon={User}>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{detail.empNotes}</p>
              </Section>
            )}
          </div>
        )}
      </div>

      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold">{editMode ? "Editar empleado" : "Nuevo empleado"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <FormField label="Nombre" required>
                <input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={INPUT} placeholder="Nombre" />
              </FormField>
              <FormField label="Apellidos">
                <input value={form.lastName ?? ""} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className={INPUT} placeholder="Apellidos" />
              </FormField>
              <FormField label="Rol" required>
                <select value={form.role ?? "employee"} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={INPUT}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </FormField>
              <FormField label="Estado">
                <select value={form.empStatus ?? "active"} onChange={(e) => setForm((f) => ({ ...f, empStatus: e.target.value }))} className={INPUT}>
                  {EMP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </FormField>
              <FormField label="DNI/NIE">
                <input value={form.dni ?? ""} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} className={INPUT} placeholder="12345678A" />
              </FormField>
              <FormField label="N.º empleado">
                <input value={form.employeeNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, employeeNumber: e.target.value }))} className={INPUT} placeholder="E001" />
              </FormField>
              <FormField label="Email">
                <input type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={INPUT} placeholder="correo@ejemplo.com" />
              </FormField>
              <FormField label="Teléfono">
                <input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={INPUT} placeholder="600000000" />
              </FormField>
              <FormField label="Tipo contrato">
                <select value={form.contractType ?? "full_time"} onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))} className={INPUT}>
                  {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </FormField>
              <FormField label="Horas/semana">
                <input type="number" value={form.weeklyHours ?? ""} onChange={(e) => setForm((f) => ({ ...f, weeklyHours: e.target.value }))} className={INPUT} placeholder="40" />
              </FormField>
              <FormField label="Puesto">
                <select value={form.positionId ?? ""} onChange={(e) => setForm((f) => ({ ...f, positionId: e.target.value || undefined }))} className={INPUT}>
                  <option value="">Sin puesto</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </FormField>
              <FormField label="Departamento">
                <select value={form.departmentId ?? ""} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value || undefined }))} className={INPUT}>
                  <option value="">Sin departamento</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </FormField>
              <FormField label="Fecha alta">
                <input type="date" value={form.hireDate ?? ""} onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value || undefined }))} className={INPUT} />
              </FormField>
              <FormField label="Fecha baja">
                <input type="date" value={form.terminationDate ?? ""} onChange={(e) => setForm((f) => ({ ...f, terminationDate: e.target.value || undefined }))} className={INPUT} />
              </FormField>
              <FormField label="Coste/hora (€)">
                <input type="number" step="0.01" value={form.hourlyRate ?? ""} onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value || undefined }))} className={INPUT} placeholder="9.50" />
              </FormField>
              <FormField label="Coef. empresa">
                <input type="number" step="0.01" value={form.employerCostRate ?? "1.35"} onChange={(e) => setForm((f) => ({ ...f, employerCostRate: e.target.value }))} className={INPUT} placeholder="1.35" />
              </FormField>
              <FormField label="ID Anviz">
                <input value={form.anvizId ?? ""} onChange={(e) => setForm((f) => ({ ...f, anvizId: e.target.value || undefined }))} className={INPUT} placeholder="ID lector Anviz" />
              </FormField>
              <FormField label="PIN (4-6 dígitos)">
                <input type="password" value={form.pin ?? ""} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value || undefined }))} className={INPUT} placeholder={editMode ? "Vacío = sin cambio" : "Nuevo PIN"} />
              </FormField>
              <FormField label="Observaciones" className="col-span-2">
                <textarea value={form.empNotes ?? ""} onChange={(e) => setForm((f) => ({ ...f, empNotes: e.target.value || undefined }))} className={`${INPUT} h-20 resize-none`} placeholder="Notas internas..." />
              </FormField>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
                {saveMutation.isPending ? "Guardando..." : editMode ? "Guardar cambios" : "Crear empleado"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
