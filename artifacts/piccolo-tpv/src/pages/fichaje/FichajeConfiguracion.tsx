import { useState, useEffect } from "react";
import { Settings, Save, CheckCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface FichajeSettings {
  companyName: string;
  locale: string;
  timezone: string;
  weekStart: string;
  mobileClockEnabled: boolean;
  reportEmail: string;
  reportDayOfWeek: number;
}

export default function FichajeConfiguracion() {
  const [settings, setSettings] = useState<FichajeSettings>({
    companyName: "Piccolo La Ràpita", locale: "es-ES", timezone: "Europe/Madrid",
    weekStart: "monday", mobileClockEnabled: false, reportEmail: "", reportDayOfWeek: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetch(`${BASE}api/fichaje/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setSettings(s => ({ ...s, ...d, reportEmail: d.reportEmail ?? "" })))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    await fetch(`${BASE}api/fichaje/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...settings, reportEmail: settings.reportEmail || null }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-7 h-7 text-teal-600" />
        <h1 className="text-2xl font-bold text-gray-900">Configuración de fichaje</h1>
      </div>

      <div className="space-y-6">
        {/* General */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la empresa</label>
              <input value={settings.companyName} onChange={e => setSettings(s => ({ ...s, companyName: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Locale</label>
                <select value={settings.locale} onChange={e => setSettings(s => ({ ...s, locale: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="es-ES">Español (España)</option>
                  <option value="ca-ES">Català</option>
                  <option value="en-GB">English (UK)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zona horaria</label>
                <select value={settings.timezone} onChange={e => setSettings(s => ({ ...s, timezone: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="Europe/Madrid">Europe/Madrid</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inicio de semana</label>
              <select value={settings.weekStart} onChange={e => setSettings(s => ({ ...s, weekStart: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="monday">Lunes</option>
                <option value="sunday">Domingo</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mobile clock */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Fichaje móvil</h2>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-sm font-medium text-gray-700">Habilitar fichaje desde móvil</div>
              <div className="text-xs text-gray-500 mt-0.5">Permite fichar desde la pantalla pública en <code className="bg-gray-100 px-1 rounded">/fichaje</code> sin sesión iniciada</div>
            </div>
            <div
              onClick={() => setSettings(s => ({ ...s, mobileClockEnabled: !s.mobileClockEnabled }))}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${settings.mobileClockEnabled ? "bg-teal-600" : "bg-gray-300"}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.mobileClockEnabled ? "translate-x-7" : "translate-x-1"}`} />
            </div>
          </label>
        </div>

        {/* Reports */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Informes automáticos</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email para informes semanales</label>
              <input type="email" value={settings.reportEmail} onChange={e => setSettings(s => ({ ...s, reportEmail: e.target.value }))}
                placeholder="admin@piccolo.es" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Día del informe semanal</label>
              <select value={settings.reportDayOfWeek} onChange={e => setSettings(s => ({ ...s, reportDayOfWeek: parseInt(e.target.value) }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                {["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map((d, i) => (
                  <option key={i} value={i + 1}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-teal-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
          <Save className="w-4 h-4" />
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {saved && (
          <div className="flex items-center gap-1.5 text-green-600 text-sm">
            <CheckCircle className="w-4 h-4" /> Guardado
          </div>
        )}
      </div>
    </div>
  );
}
