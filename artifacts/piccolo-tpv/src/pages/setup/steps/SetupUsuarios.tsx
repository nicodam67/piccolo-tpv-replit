import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch } from '../setupUtils';

interface Employee {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

const ROLES = [
  { value: 'admin',    label: 'Admin',     desc: 'Acceso completo al sistema' },
  { value: 'manager',  label: 'Gerente',   desc: 'Gestión y configuración' },
  { value: 'waiter',   label: 'Camarero',  desc: 'Servicio de mesa y cobro' },
  { value: 'kitchen',  label: 'Cocina',    desc: 'KDS y comandas de cocina' },
  { value: 'delivery', label: 'Repartidor',desc: 'Vista de repartidor' },
];

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    admin: 'bg-red-500/15 text-red-400',
    manager: 'bg-amber-500/15 text-amber-400',
    waiter: 'bg-blue-500/15 text-blue-400',
    kitchen: 'bg-green-500/15 text-green-400',
    delivery: 'bg-purple-500/15 text-purple-400',
  };
  const label = ROLES.find((r) => r.value === role)?.label ?? role;
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[role] ?? 'bg-zinc-700 text-zinc-400'}`}>{label}</span>;
}

export default function SetupUsuarios({ onNext, onBack, onSkip }: StepProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'waiter', pin: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setupFetch<{ data: Employee[] } | Employee[]>('/api/hr/employees?limit=50')
      .then((d) => {
        const list = Array.isArray(d) ? d : ((d as { data: Employee[] }).data ?? []);
        setEmployees(list);
      })
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);

  const hasAdmin = employees.some((e) => e.role === 'admin' && e.active);

  function setField(f: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [f]: e.target.value }));
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) { toast.error('El PIN debe tener exactamente 4 dígitos'); return; }
    setSaving(true);
    try {
      const created = await setupFetch<Employee>('/api/hr/employees', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, role: form.role, pin: form.pin, active: true }),
      });
      setEmployees((e) => [...e, created]);
      setForm({ name: '', role: 'waiter', pin: '' });
      setShowForm(false);
      toast.success(`Usuario "${form.name}" creado`);
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">👥 Usuarios y empleados</h2>
      <p className="text-zinc-500 mb-6">Crea las cuentas de los empleados que usarán el sistema.</p>

      {!hasAdmin && employees.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-5 text-sm text-amber-300 flex items-start gap-2">
          <span>⚠️</span>
          <span>Necesitas al menos un usuario con rol <strong>Admin</strong> para acceder al panel completo.</span>
        </div>
      )}

      {/* Employee list */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-4">Cargando empleados…</div>
      ) : (
        <div className="mb-6 space-y-2">
          {employees.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500">
              <p className="text-3xl mb-2">👥</p>
              <p>No hay usuarios creados aún.</p>
            </div>
          ) : (
            employees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-sm font-bold text-zinc-400">
                    {emp.name[0]?.toUpperCase()}
                  </div>
                  <span className="text-zinc-200 font-medium">{emp.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {roleBadge(emp.role)}
                  {!emp.active && <span className="text-xs text-zinc-600">Inactivo</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add user form */}
      {showForm ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-4">
          <h3 className="font-semibold text-zinc-200 mb-4">Nuevo usuario</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Nombre <span className="text-amber-500">*</span></label>
              <input value={form.name} onChange={setField('name')} placeholder="Nombre completo"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Rol</label>
              <select value={form.role} onChange={setField('role')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">PIN (4 dígitos) <span className="text-amber-500">*</span></label>
              <input value={form.pin} onChange={setField('pin')} type="password" maxLength={4} pattern="\d{4}"
                placeholder="••••"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">Cancelar</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
              {saving ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg text-sm transition-colors mb-4">
          + Añadir usuario
        </button>
      )}

      <p className="text-xs text-zinc-600 mt-2">El PIN de 4 dígitos se usa para iniciar sesión en el TPV. El admin puede cambiar PINs más adelante desde Fichaje {'>'} Configuración.</p>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Omitir</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors">
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
