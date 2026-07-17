import { useState, useEffect } from "react";
import { LogIn, LogOut, Coffee, CoffeeIcon, Clock, ChevronLeft, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import { api } from "../../lib/api-client";

interface Employee {
  id: string;
  name: string;
}

type ClockStatus = "out" | "in" | "break";

interface ClockState {
  status: ClockStatus;
  record: { id: string; clockIn: string } | null;
  activeBreak: { id: string; breakStart: string } | null;
}

export default function FichajeReloj() {
  const [, navigate] = useLocation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [clockState, setClockState] = useState<ClockState | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());
  const [mobileEnabled, setMobileEnabled] = useState(false);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function loadPublicData() {
      api.get<Employee[]>("/api/fichaje/public/employees")
        .then(setEmployees).catch(() => {});
      api.get<{ mobileClockEnabled: boolean }>("/api/fichaje/public/clock-status")
        .then(d => setMobileEnabled(d.mobileClockEnabled)).catch(() => {});
    }
    loadPublicData();
    const onVisibility = () => { if (!document.hidden) loadPublicData(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  async function selectEmployee(emp: Employee) {
    setSelected(emp);
    const d = await api.get<ClockState>(`/api/fichaje/public/my-status/${emp.id}`);
    setClockState(d);
  }

  async function doAction(action: "clock_in" | "clock_out" | "break_start" | "break_end") {
    if (!selected || !mobileEnabled) return;
    setLoading(true);
    try {
      await api.post("/api/fichaje/public/clock", { employeeId: selected.id, action, source: "pin" });
      const s = await api.get<ClockState>(`/api/fichaje/public/my-status/${selected.id}`);
      setClockState(s);
    } catch (e: any) {
      alert(e.message || "Error al fichar");
    } finally {
      setLoading(false);
    }
  }

  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  if (!mobileEnabled) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <Clock className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Fichaje móvil deshabilitado</h2>
        <p className="text-gray-500 text-sm">El administrador puede habilitarlo desde Configuración de fichaje.</p>
        <button onClick={() => navigate("/")} className="mt-6 text-sm text-teal-600 underline">Volver al inicio</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-teal-700 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => { setSelected(null); setClockState(null); }} className="p-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="text-2xl font-bold tabular-nums">{timeStr}</div>
          <div className="text-sm opacity-80 capitalize">{dateStr}</div>
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4 max-w-md mx-auto w-full">
        {/* Employee selector */}
        {!selected ? (
          <>
            <p className="text-gray-600 text-center mt-4 mb-2">Selecciona tu nombre para fichar</p>
            <div className="flex flex-col gap-2">
              {employees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => selectEmployee(emp)}
                  className="bg-white border border-gray-200 rounded-xl px-5 py-4 text-left font-medium text-gray-800 hover:bg-teal-50 hover:border-teal-300 transition-colors shadow-sm flex items-center gap-3"
                >
                  <UserCheck className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  {emp.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Status card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="text-lg font-semibold text-gray-800 mb-1">{selected.name}</div>
              {clockState && (
                <div className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-1 rounded-full ${
                  clockState.status === "in" ? "bg-green-100 text-green-700" :
                  clockState.status === "break" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    clockState.status === "in" ? "bg-green-500" :
                    clockState.status === "break" ? "bg-amber-500" : "bg-gray-400"
                  }`} />
                  {clockState.status === "in" ? "Trabajando" :
                   clockState.status === "break" ? "En descanso" : "Fuera"}
                </div>
              )}
              {clockState?.record && (
                <p className="text-xs text-gray-500 mt-2">
                  Entrada: {new Date(clockState.record.clockIn).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {clockState?.activeBreak && (
                <p className="text-xs text-gray-500">
                  Descanso desde: {new Date(clockState.activeBreak.breakStart).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {clockState?.status === "out" && (
                <button
                  onClick={() => doAction("clock_in")}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-2xl py-5 text-lg font-semibold flex items-center justify-center gap-3 shadow transition-colors disabled:opacity-50"
                >
                  <LogIn className="w-6 h-6" /> Entrar
                </button>
              )}
              {clockState?.status === "in" && (
                <>
                  <button
                    onClick={() => doAction("break_start")}
                    disabled={loading}
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-2xl py-5 text-lg font-semibold flex items-center justify-center gap-3 shadow transition-colors disabled:opacity-50"
                  >
                    <Coffee className="w-6 h-6" /> Iniciar descanso
                  </button>
                  <button
                    onClick={() => doAction("clock_out")}
                    disabled={loading}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-2xl py-5 text-lg font-semibold flex items-center justify-center gap-3 shadow transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-6 h-6" /> Salir
                  </button>
                </>
              )}
              {clockState?.status === "break" && (
                <>
                  <button
                    onClick={() => doAction("break_end")}
                    disabled={loading}
                    className="bg-teal-600 hover:bg-teal-700 text-white rounded-2xl py-5 text-lg font-semibold flex items-center justify-center gap-3 shadow transition-colors disabled:opacity-50"
                  >
                    <CoffeeIcon className="w-6 h-6" /> Fin descanso
                  </button>
                  <button
                    onClick={() => doAction("clock_out")}
                    disabled={loading}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-2xl py-5 text-lg font-semibold flex items-center justify-center gap-3 shadow transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-6 h-6" /> Salir directamente
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
