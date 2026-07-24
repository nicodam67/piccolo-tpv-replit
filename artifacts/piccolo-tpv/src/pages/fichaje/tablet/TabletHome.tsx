/**
 * TabletHome — pantalla principal del quiosco de fichaje.
 *
 * Modos:
 *   • NFC disponible   → pantalla de espera con animación + botón "Fichar con PIN"
 *   • NFC no disponible → badge "NFC no disponible" + cuadrícula de empleados + PIN
 *
 * ⚠️ IMPLEMENTACIÓN PREPARADA — PENDIENTE DE VALIDACIÓN FÍSICA CON HARDWARE REAL
 * La integración Web NFC requiere Chrome 89+/Android con chip NFC y HTTPS.
 */
import { useState, useEffect, useCallback } from "react";
import { Search, Wifi, WifiOff, Nfc, KeyRound, WifiOff as NfcOff, AlertCircle } from "lucide-react";
import { useTabletClock } from "./useTabletClock";
import { useNfc } from "./useNfc";
import {
  deviceTokenRequest,
  getTimeclockPublicEmployees,
  postTimeclockNfcIdentify,
} from "@workspace/api-client-react/timeclock";
import { ApiError } from "@workspace/api-client-react/timeclock";

interface Employee {
  id: string;
  name: string;
  initials: string;
}

interface Props {
  onSelectEmployee: (emp: Employee) => void;
  /** Called when NFC identifies an employee (skip PIN, go directly to status) */
  onNfcIdentified: (employee: Employee, clockStatus: NfcClockStatus) => void;
  deviceToken: string;
}

export interface NfcClockStatus {
  status: "out" | "in" | "break";
  record: { id: string; clockIn: string } | null;
  activeBreak: { id: string; breakStart: string } | null;
  proofs: Record<"clock_in" | "clock_out" | "break_start" | "break_end", string>;
}

function toInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

const COLORS = [
  "bg-teal-600", "bg-indigo-600", "bg-emerald-600",
  "bg-sky-600", "bg-rose-600", "bg-violet-600",
  "bg-amber-600", "bg-cyan-600",
];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}

export default function TabletHome({ onSelectEmployee, onNfcIdentified, deviceToken }: Props) {
  const { timeDisplay, dateDisplay } = useTabletClock();
  const nfc = useNfc();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  // show employee grid even when NFC is supported (toggled by "Fichar con PIN")
  const [showGrid, setShowGrid] = useState(!nfc.isSupported);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [nfcIdentifying, setNfcIdentifying] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    function load() {
      setLoading(true);
      getTimeclockPublicEmployees(deviceTokenRequest(deviceToken))
        .then(data =>
          setEmployees(data.map(e => ({ ...e, initials: toInitials(e.name) })))
        )
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [deviceToken]);

  // Start NFC scanning when supported
  useEffect(() => {
    if (nfc.isSupported) {
      nfc.startScanning().catch(() => {});
    }
    return () => { nfc.stopScanning(); };
  }, [nfc.isSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle NFC reads — identify employee via API
  const handleNfcRead = useCallback(async (uid: string) => {
    if (nfcIdentifying) return;
    setNfcIdentifying(true);
    setNfcError(null);
    try {
      const data = await postTimeclockNfcIdentify({ rawToken: uid, deviceToken });
      const emp: Employee = {
        id: data.employeeId,
        name: data.employeeName,
        initials: toInitials(data.employeeName),
      };
      const clockStatus: NfcClockStatus = {
        status: data.currentStatus,
        record: data.record ?? null,
        activeBreak: data.activeBreak ?? null,
        proofs: data.proofs,
      };
      onNfcIdentified(emp, clockStatus);
    } catch (err) {
      const message = err instanceof ApiError
        ? (typeof err.data === "object" && err.data && "error" in (err.data as object)
          ? String((err.data as { error?: string }).error)
          : err.message)
        : "Error de red al identificar la tarjeta";
      setNfcError(message);
      setTimeout(() => setNfcError(null), 4000);
    } finally {
      setNfcIdentifying(false);
    }
  }, [deviceToken, nfcIdentifying, onNfcIdentified]);

  useEffect(() => {
    if (nfc.lastRead) {
      void handleNfcRead(nfc.lastRead.uid);
    }
  }, [nfc.lastRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = employees.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* ── Header: clock + date ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-teal-900 px-6 py-6 flex flex-col items-center text-center">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-lg">P</div>
          <span className="text-white/80 text-lg font-medium tracking-wide">Piccolo La Ràpita</span>
        </div>
        <div className="text-white text-6xl sm:text-8xl font-mono font-bold tabular-nums tracking-tight leading-none mb-2">
          {timeDisplay}
        </div>
        <div className="text-teal-200 text-lg capitalize mt-1">{dateDisplay}</div>
        <div className="mt-4 text-teal-100 text-sm font-medium tracking-widest uppercase opacity-70">
          Registro de jornada
        </div>
        <div className={`flex items-center gap-1.5 mt-3 text-xs px-3 py-1 rounded-full ${
          online ? "text-teal-300" : "text-red-400 bg-red-900/40"
        }`}>
          {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          {online ? "Conectado" : "Sin conexión"}
        </div>

        {/* NFC badge when not supported */}
        {!nfc.isSupported && (
          <div className="flex items-center gap-1.5 mt-2 text-xs px-3 py-1 rounded-full text-yellow-400 bg-yellow-900/40">
            <NfcOff size={12} />
            NFC no disponible — usa tu PIN
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {nfc.isSupported && !showGrid ? (
        /* ── NFC waiting screen ────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          {nfcError ? (
            /* Error state */
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-red-900/30 border-2 border-red-500/40 flex items-center justify-center">
                <AlertCircle size={40} className="text-red-400" />
              </div>
              <p className="text-red-300 text-center text-lg font-medium">{nfcError}</p>
              <p className="text-gray-500 text-sm text-center">Acerque de nuevo su tarjeta o use PIN</p>
            </div>
          ) : nfcIdentifying ? (
            /* Identifying state */
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-teal-800/40 border-2 border-teal-500/50 flex items-center justify-center animate-pulse">
                <Nfc size={44} className="text-teal-400" />
              </div>
              <p className="text-teal-300 text-center text-xl font-medium">Identificando…</p>
            </div>
          ) : (
            /* Default: waiting for card */
            <div className="flex flex-col items-center gap-6">
              {/* Animated NFC icon */}
              <div className="relative flex items-center justify-center">
                {/* Ripple rings */}
                <div className="absolute w-36 h-36 rounded-full border-2 border-teal-500/20 animate-ping" style={{ animationDuration: "2s" }} />
                <div className="absolute w-28 h-28 rounded-full border-2 border-teal-500/30 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
                <div className="w-20 h-20 rounded-full bg-teal-800/50 border-2 border-teal-500/60 flex items-center justify-center">
                  <Nfc size={40} className="text-teal-300" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-white text-2xl font-bold mb-2">Acerque su tarjeta NFC</p>
                <p className="text-gray-400 text-base">o llavero al lector de la tablet</p>
              </div>
            </div>
          )}

          {/* Always-visible PIN button */}
          <button
            onClick={() => setShowGrid(true)}
            className="flex items-center gap-2 mt-4 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-2xl transition-colors text-base font-medium border border-gray-700"
          >
            <KeyRound size={18} />
            Fichar con PIN
          </button>
        </div>
      ) : (
        /* ── Employee grid (PIN mode or NFC not supported) ───────────── */
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <p className="text-gray-400 text-base">
              {nfc.isSupported
                ? "Selecciona tu nombre para fichar con PIN"
                : "Selecciona tu nombre para fichar"
              }
            </p>
            {nfc.isSupported && (
              <button
                onClick={() => { setShowGrid(false); setSearch(""); }}
                className="flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300 transition-colors"
              >
                <Nfc size={14} />
                Usar NFC
              </button>
            )}
          </div>

          <div className="relative flex-shrink-0 mb-4">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nombre…"
              className="w-full h-14 bg-gray-800 text-white pl-12 pr-4 rounded-2xl text-lg placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">Cargando empleados…</div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              {search ? "Ningún empleado coincide" : "No hay empleados activos"}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                {filtered.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className="group bg-gray-800 hover:bg-gray-700 active:scale-95 rounded-3xl p-5 flex flex-col items-center gap-3 transition-all duration-150 shadow-lg border border-gray-700 hover:border-teal-600"
                  >
                    <div className={`w-14 h-14 rounded-full ${colorFor(emp.name)} flex items-center justify-center text-xl font-bold text-white shadow-inner`}>
                      {emp.initials}
                    </div>
                    <span className="text-white text-sm font-medium text-center leading-tight line-clamp-2">
                      {emp.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
