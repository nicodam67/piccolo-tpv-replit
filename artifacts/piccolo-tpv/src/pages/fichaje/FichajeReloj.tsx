import { useState, useEffect } from "react";
import { Clock, ChevronLeft, Tablet } from "lucide-react";
import { useLocation } from "wouter";
import { getTimeclockMobileClockStatus } from "@workspace/api-client-react/timeclock";
import type { TimeclockMobileClockStatus } from "@workspace/api-client-react/timeclock";

/**
 * Fichaje móvil público — BLOQUEADO (Entrega 57).
 * El backend exige deviceToken + proof; esta pantalla no dispone de credenciales de tablet.
 * mobileClockEnabled también está fail-closed en runtime.
 */
export default function FichajeReloj() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<TimeclockMobileClockStatus | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getTimeclockMobileClockStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <Clock className="w-12 h-12 text-gray-400 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Fichaje móvil no disponible</h2>
      <p className="text-gray-500 text-sm max-w-md mb-2">
        {status?.reason ?? "El fichaje requiere un dispositivo registrado"}
      </p>
      {status?.configuredMobileClockEnabled && (
        <p className="text-amber-700 text-xs max-w-md mb-4">
          La opción está activada en configuración, pero el servidor mantiene el fichaje móvil deshabilitado hasta disponer del flujo seguro con credenciales de tablet.
        </p>
      )}
      <p className="text-gray-600 text-sm max-w-md mb-6">
        Para fichar de forma segura, utilice la tablet de fichaje registrada en <code className="bg-gray-200 px-1 rounded">/fichaje/tablet</code>.
        No se realizan fichajes anónimos ni sin proof de autorización.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => navigate("/fichaje/tablet")}
          className="inline-flex items-center justify-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-teal-700"
        >
          <Tablet className="w-4 h-4" /> Ir a tablet de fichaje
        </button>
        <button onClick={() => navigate("/")} className="inline-flex items-center justify-center gap-2 text-sm text-teal-600 underline">
          <ChevronLeft className="w-4 h-4" /> Volver al inicio
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-8 tabular-nums">{timeStr} · <span className="capitalize">{dateStr}</span></p>
    </div>
  );
}
