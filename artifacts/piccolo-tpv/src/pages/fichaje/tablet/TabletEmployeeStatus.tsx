/**
 * TabletEmployeeStatus — shows employee's current clock state
 * and only valid actions for that state.
 */
import { useState } from "react";
import { LogIn, LogOut, Coffee, UtensilsCrossed, Loader2, X } from "lucide-react";

interface Employee { id: string; name: string; initials: string; }

interface StatusResult {
  status: "out" | "in" | "break";
  record: { id: string; clockIn: string } | null;
  activeBreak: { id: string; breakStart: string } | null;
}

type Action = "clock_in" | "clock_out" | "break_start" | "break_end";

interface Props {
  employee: Employee;
  status: StatusResult;
  onAction: (action: Action) => Promise<void>;
  onCancel: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  out:   "Fuera de jornada",
  in:    "Trabajando",
  break: "En descanso",
};

const STATUS_COLOR: Record<string, string> = {
  out:   "bg-gray-700 text-gray-300",
  in:    "bg-green-900/60 text-green-400",
  break: "bg-amber-900/60 text-amber-400",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function workedMins(clockIn: string) {
  return Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  loading: boolean;
}

function ActionButton({ icon, label, color, onClick, loading }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`
        w-full h-24 rounded-3xl flex flex-col items-center justify-center gap-2 
        text-white text-lg font-semibold shadow-xl
        transition-all duration-150 active:scale-95 disabled:opacity-50
        ${color}
      `}
    >
      {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : icon}
      {!loading && <span>{label}</span>}
    </button>
  );
}

export default function TabletEmployeeStatus({ employee, status, onAction, onCancel }: Props) {
  const [loading, setLoading] = useState<Action | null>(null);

  async function doAction(action: Action) {
    if (loading) return;
    setLoading(action);
    try {
      await onAction(action);
    } finally {
      setLoading(null);
    }
  }

  const workedTime = status.record
    ? (() => {
        const mins = workedMins(status.record.clockIn);
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
      })()
    : null;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      {/* Employee card */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-20 h-20 rounded-full bg-teal-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
          {employee.initials}
        </div>
        <div>
          <p className="text-white text-2xl font-bold">{employee.name}</p>
          <span className={`inline-block text-sm font-medium px-3 py-1 rounded-full mt-1 ${STATUS_COLOR[status.status] ?? "bg-gray-700 text-gray-300"}`}>
            {STATUS_LABEL[status.status] ?? status.status}
          </span>
        </div>
      </div>

      {/* Info row */}
      {status.record && (
        <div className="flex gap-6 mb-8 text-center">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Entrada</p>
            <p className="text-white text-lg font-semibold">{fmtTime(status.record.clockIn)}</p>
          </div>
          {workedTime && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Tiempo trabajado</p>
              <p className="text-white text-lg font-semibold">{workedTime}</p>
            </div>
          )}
          {status.activeBreak && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Descanso desde</p>
              <p className="text-amber-400 text-lg font-semibold">{fmtTime(status.activeBreak.breakStart)}</p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons — only valid for current state */}
      <div className="w-full max-w-sm space-y-3">
        {status.status === "out" && (
          <ActionButton
            icon={<LogIn className="w-8 h-8" />}
            label="Entrada"
            color="bg-green-600 hover:bg-green-500"
            onClick={() => doAction("clock_in")}
            loading={loading === "clock_in"}
          />
        )}

        {status.status === "in" && (
          <>
            <ActionButton
              icon={<Coffee className="w-8 h-8" />}
              label="Iniciar descanso"
              color="bg-amber-600 hover:bg-amber-500"
              onClick={() => doAction("break_start")}
              loading={loading === "break_start"}
            />
            <ActionButton
              icon={<LogOut className="w-8 h-8" />}
              label="Salida"
              color="bg-red-700 hover:bg-red-600"
              onClick={() => doAction("clock_out")}
              loading={loading === "clock_out"}
            />
          </>
        )}

        {status.status === "break" && (
          <>
            <ActionButton
              icon={<UtensilsCrossed className="w-8 h-8" />}
              label="Finalizar descanso"
              color="bg-teal-600 hover:bg-teal-500"
              onClick={() => doAction("break_end")}
              loading={loading === "break_end"}
            />
            <ActionButton
              icon={<LogOut className="w-8 h-8" />}
              label="Salida directa"
              color="bg-red-700 hover:bg-red-600"
              onClick={() => doAction("clock_out")}
              loading={loading === "clock_out"}
            />
          </>
        )}
      </div>

      <button
        onClick={onCancel}
        className="mt-10 flex items-center gap-2 text-gray-600 hover:text-gray-400 text-sm transition-colors"
      >
        <X size={16} /> Cancelar
      </button>
    </div>
  );
}
