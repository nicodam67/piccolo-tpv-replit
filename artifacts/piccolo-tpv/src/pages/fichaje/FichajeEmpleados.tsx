/**
 * Empleados de fichaje — gestión de personal para control horario.
 * Comparte la misma tabla employees del módulo HR.
 */
import { useState, useEffect } from "react";
import { Plus, Search, Users, Edit, Power, Key } from "lucide-react";
import { api } from "../../lib/api-client";

interface FichajeEmployee {
  id: string;
  name: string;
  role: string;
  active: boolean;
  pin?: string;
  anvizId?: string;
}

export default function FichajeEmpleados() {
  const [employees, setEmployees] = useState<FichajeEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get<FichajeEmployee[]>("/api/employees")
      .then(d => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empleados</h1>
          <p className="text-muted-foreground text-sm mt-1">Personal registrado para control horario</p>
        </div>
        <button className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
          <Plus size={16} /> Nuevo empleado
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar empleado…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando…</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => (
            <div key={emp.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{emp.name}</p>
                <p className="text-xs text-muted-foreground">{emp.role}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${emp.active ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  {emp.active ? "Activo" : "Inactivo"}
                </span>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Editar">
                  <Edit size={15} />
                </button>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="PIN">
                  <Key size={15} />
                </button>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Activar/Desactivar">
                  <Power size={15} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users size={36} className="mx-auto mb-2 opacity-30" />
              No se encontraron empleados
            </div>
          )}
        </div>
      )}
    </div>
  );
}
