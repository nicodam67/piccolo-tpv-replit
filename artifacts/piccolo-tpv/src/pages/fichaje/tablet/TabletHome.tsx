/**
 * TabletHome — main kiosk screen:
 * large clock, date, employee grid with search.
 */
import { useState, useEffect } from "react";
import { Search, Wifi, WifiOff } from "lucide-react";
import { useTabletClock } from "./useTabletClock";

const BASE = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(/\/$/, "");

interface Employee {
  id: string;
  name: string;
  initials: string;
}

interface Props {
  onSelectEmployee: (emp: Employee) => void;
}

function toInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

// Pastel color from name for avatar
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

export default function TabletHome({ onSelectEmployee }: Props) {
  const { timeDisplay, dateDisplay } = useTabletClock();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);

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
      fetch(`${BASE}/api/fichaje/public/employees`)
        .then(r => r.ok ? r.json() : [])
        .then((data: { id: string; name: string }[]) =>
          setEmployees(data.map(e => ({ ...e, initials: toInitials(e.name) })))
        )
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    load();
    // Refresh every 5 min in case employees are added
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = employees.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* ── Top section: clock + date ──────────────────────────────────── */}
      <div className="flex-shrink-0 bg-teal-900 px-6 py-6 flex flex-col items-center text-center">
        {/* Logo + name */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-lg">P</div>
          <span className="text-white/80 text-lg font-medium tracking-wide">Piccolo La Ràpita</span>
        </div>

        {/* Large clock */}
        <div className="text-white text-6xl sm:text-8xl font-mono font-bold tabular-nums tracking-tight leading-none mb-2">
          {timeDisplay}
        </div>
        <div className="text-teal-200 text-lg capitalize mt-1">{dateDisplay}</div>

        {/* Title */}
        <div className="mt-4 text-teal-100 text-sm font-medium tracking-widest uppercase opacity-70">
          Registro de jornada
        </div>

        {/* Connection indicator */}
        <div className={`flex items-center gap-1.5 mt-3 text-xs px-3 py-1 rounded-full ${
          online ? "text-teal-300" : "text-red-400 bg-red-900/40"
        }`}>
          {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          {online ? "Conectado" : "Sin conexión"}
        </div>
      </div>

      {/* ── Employee selection ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <p className="text-gray-400 text-center text-base mb-4 flex-shrink-0">
          Selecciona tu nombre para fichar
        </p>

        {/* Search bar */}
        <div className="relative flex-shrink-0 mb-4">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nombre…"
            className="w-full h-14 bg-gray-800 text-white pl-12 pr-4 rounded-2xl text-lg placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>

        {/* Employee grid */}
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
    </div>
  );
}
