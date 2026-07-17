import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check, X, Briefcase, Building2 } from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Position = { id: string; name: string; code: string; departmentId?: string | null; active: boolean; department?: { id: string; name: string } | null };
type Department = { id: string; name: string; code: string; active: boolean };

const INPUT = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500";

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

function useApi<T>(key: string[], path: string) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` } });
      if (!res.ok) throw new Error("Error");
      return res.json() as Promise<T>;
    },
  });
}

interface InlineFormProps {
  value: { name: string; code: string; extra?: string };
  onChange: (v: { name: string; code: string; extra?: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  extras?: React.ReactNode;
}

function InlineForm({ value, onChange, onSave, onCancel, pending, extras }: InlineFormProps) {
  return (
    <div className="flex gap-2 items-start p-3 bg-gray-800 rounded-lg">
      <div className="flex-1 grid grid-cols-3 gap-2">
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Nombre"
          className={INPUT}
        />
        <input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          placeholder="Código"
          className={INPUT}
        />
        {extras}
      </div>
      <button onClick={onSave} disabled={pending} className="p-2 bg-green-700 hover:bg-green-600 rounded-lg disabled:opacity-50">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onCancel} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function HRCatalogos() {
  const qc = useQueryClient();

  // Positions
  const { data: positions = [] } = useApi<Position[]>(["hr-positions"], "/api/hr/positions");
  const [editingPos, setEditingPos] = useState<string | null>(null);
  const [newPos, setNewPos] = useState(false);
  const [posForm, setPosForm] = useState({ name: "", code: "", extra: "" }); // extra = departmentId

  // Departments
  const { data: departments = [] } = useApi<Department[]>(["hr-departments"], "/api/hr/departments");
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [newDept, setNewDept] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: "", code: "", extra: "" });

  const mutateDept = useMutation({
    mutationFn: async ({ method, id, body }: { method: string; id?: string; body: Record<string, unknown> }) => {
      const url = id ? `${BASE}/api/hr/departments/${id}` : `${BASE}/api/hr/departments`;
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-departments"] }); setEditingDept(null); setNewDept(false); setDeptForm({ name: "", code: "", extra: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutatePos = useMutation({
    mutationFn: async ({ method, id, body }: { method: string; id?: string; body: Record<string, unknown> }) => {
      const url = id ? `${BASE}/api/hr/positions/${id}` : `${BASE}/api/hr/positions`;
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-positions"] }); setEditingPos(null); setNewPos(false); setPosForm({ name: "", code: "", extra: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDept = (id: string) => {
    if (!confirm("¿Eliminar departamento?")) return;
    mutateDept.mutate({ method: "DELETE", id, body: {} });
  };
  const deletePos = (id: string) => {
    if (!confirm("¿Eliminar puesto?")) return;
    mutatePos.mutate({ method: "DELETE", id, body: {} });
  };

  const deptSelector = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      <option value="">Sin departamento</option>
      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Departments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Departamentos</h2>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{departments.length}</span>
          </div>
          <button onClick={() => { setNewDept(true); setDeptForm({ name: "", code: "", extra: "" }); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Código</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {newDept && (
                <tr>
                  <td colSpan={4} className="px-4 py-2">
                    <InlineForm
                      value={deptForm}
                      onChange={(v) => setDeptForm({ name: v.name, code: v.code, extra: v.extra ?? "" })}
                      onSave={() => mutateDept.mutate({ method: "POST", body: { name: deptForm.name, code: deptForm.code } })}
                      onCancel={() => setNewDept(false)}
                      pending={mutateDept.isPending}
                    />
                  </td>
                </tr>
              )}
              {departments.map((dept) => (
                <tr key={dept.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                  {editingDept === dept.id ? (
                    <td colSpan={4} className="px-4 py-2">
                      <InlineForm
                        value={deptForm}
                        onChange={(v) => setDeptForm({ name: v.name, code: v.code, extra: v.extra ?? "" })}
                        onSave={() => mutateDept.mutate({ method: "PATCH", id: dept.id, body: { name: deptForm.name, code: deptForm.code } })}
                        onCancel={() => setEditingDept(null)}
                        pending={mutateDept.isPending}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">{dept.name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{dept.code || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${dept.active ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                          {dept.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-1 justify-end">
                        <button onClick={() => { setEditingDept(dept.id); setDeptForm({ name: dept.name, code: dept.code, extra: "" }); }}
                          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => mutateDept.mutate({ method: "PATCH", id: dept.id, body: { active: !dept.active } })}
                          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded text-xs">
                          {dept.active ? "Off" : "On"}
                        </button>
                        <button onClick={() => deleteDept(dept.id)} className="p-1.5 text-red-600 hover:text-red-400 hover:bg-red-900/20 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {departments.length === 0 && !newDept && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Sin departamentos — crea el primero</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Positions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">Puestos de trabajo</h2>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{positions.length}</span>
          </div>
          <button onClick={() => { setNewPos(true); setPosForm({ name: "", code: "", extra: "" }); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm">
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Código</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Departamento</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {newPos && (
                <tr>
                  <td colSpan={5} className="px-4 py-2">
                    <InlineForm
                      value={posForm}
                      onChange={(v) => setPosForm({ name: v.name, code: v.code, extra: v.extra ?? "" })}
                      onSave={() => mutatePos.mutate({ method: "POST", body: { name: posForm.name, code: posForm.code, departmentId: posForm.extra || null } })}
                      onCancel={() => setNewPos(false)}
                      pending={mutatePos.isPending}
                      extras={deptSelector(posForm.extra ?? "", (v) => setPosForm((f) => ({ ...f, extra: v })))}
                    />
                  </td>
                </tr>
              )}
              {positions.map((pos) => (
                <tr key={pos.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                  {editingPos === pos.id ? (
                    <td colSpan={5} className="px-4 py-2">
                      <InlineForm
                        value={posForm}
                        onChange={(v) => setPosForm({ name: v.name, code: v.code, extra: v.extra ?? "" })}
                        onSave={() => mutatePos.mutate({ method: "PATCH", id: pos.id, body: { name: posForm.name, code: posForm.code, departmentId: posForm.extra || null } })}
                        onCancel={() => setEditingPos(null)}
                        pending={mutatePos.isPending}
                        extras={deptSelector(posForm.extra ?? "", (v) => setPosForm((f) => ({ ...f, extra: v })))}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium">{pos.name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{pos.code || "—"}</td>
                      <td className="px-4 py-3 text-gray-400">{pos.department?.name ?? departments.find((d) => d.id === pos.departmentId)?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${pos.active ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                          {pos.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-1 justify-end">
                        <button onClick={() => { setEditingPos(pos.id); setPosForm({ name: pos.name, code: pos.code, extra: pos.departmentId ?? "" }); }}
                          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => mutatePos.mutate({ method: "PATCH", id: pos.id, body: { active: !pos.active } })}
                          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded text-xs">
                          {pos.active ? "Off" : "On"}
                        </button>
                        <button onClick={() => deletePos(pos.id)} className="p-1.5 text-red-600 hover:text-red-400 hover:bg-red-900/20 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {positions.length === 0 && !newPos && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Sin puestos — crea el primero</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
