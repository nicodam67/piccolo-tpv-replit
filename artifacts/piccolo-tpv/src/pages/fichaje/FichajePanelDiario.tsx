import { useState, useEffect } from "react";
import { Users, LogIn, LogOut, Coffee, Clock, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface TodayRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  source: string;
}

function minutesBetween(a: string, b: string | null) {
  const end = b ? new Date(b) : new Date();
  return Math.floor((end.getTime() - new Date(a).getTime()) / 60000);
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export default function FichajePanelDiario() {
  const [records, setRecords] = useState<TodayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const token = localStorage.getItem("token");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch(`${BASE}api/fichaje/records/today`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setRecords(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [now.getMinutes()]); // Refresh every minute

  const present = records.filter(r => !r.clockOut);
  const gone = records.filter(r => r.clockOut);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Panel diario</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-green-700">{present.length}</div>
          <div className="text-sm text-green-600 mt-1 flex items-center justify-center gap-1">
            <Users className="w-4 h-4" /> Presentes
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-gray-700">{gone.length}</div>
          <div className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
            <LogOut className="w-4 h-4" /> Salidos
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-700">{records.length}</div>
          <div className="text-sm text-blue-600 mt-1 flex items-center justify-center gap-1">
            <Clock className="w-4 h-4" /> Total
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Cargando...</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Sin registros hoy</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Present employees */}
          {present.map(r => (
            <div key={r.id} className="bg-white border border-green-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <div>
                  <div className="font-medium text-gray-900">{r.employeeName}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <LogIn className="w-3 h-3" /> {fmtTime(r.clockIn)}
                    <span className="ml-2 text-green-600">• {formatDuration(minutesBetween(r.clockIn, null))}</span>
                  </div>
                </div>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Trabajando</span>
            </div>
          ))}

          {/* Gone employees */}
          {gone.map(r => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm opacity-70">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <div>
                  <div className="font-medium text-gray-800">{r.employeeName}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="flex items-center gap-1"><LogIn className="w-3 h-3" />{fmtTime(r.clockIn)}</span>
                    <span>–</span>
                    <span className="flex items-center gap-1"><LogOut className="w-3 h-3" />{fmtTime(r.clockOut!)}</span>
                    <span className="text-gray-400">({formatDuration(minutesBetween(r.clockIn, r.clockOut))})</span>
                  </div>
                </div>
              </div>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Salido</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
