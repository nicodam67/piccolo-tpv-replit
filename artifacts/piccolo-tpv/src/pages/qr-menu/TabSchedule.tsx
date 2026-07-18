import type { DaySchedule, Shift } from './types';
import { DEFAULT_SCHEDULE } from './types';

const DAY_LABELS: Record<string, string> = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves',
  friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo',
};

type Props = { schedule: DaySchedule[]; onChange: (s: DaySchedule[]) => void };

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function ShiftRow({ label, shift, onChange }: { label: string; shift: Shift; onChange: (patch: Partial<Shift>) => void }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Switch checked={shift.open} onChange={(val) => onChange({ open: val })} />
      <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
      {shift.open ? (
        <>
          <input
            type="time" value={shift.openTime}
            onChange={(e) => onChange({ openTime: e.target.value })}
            className="w-24 h-7 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-gray-400 text-xs shrink-0">–</span>
          <input
            type="time" value={shift.closeTime}
            onChange={(e) => onChange({ closeTime: e.target.value })}
            className="w-24 h-7 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </>
      ) : (
        <span className="text-xs text-gray-400 italic">Cerrado</span>
      )}
    </div>
  );
}

export default function TabSchedule({ schedule, onChange }: Props) {
  function updateShift(index: number, shiftKey: 'shift1' | 'shift2', patch: Partial<Shift>) {
    const updated = schedule.map((s, i) =>
      i === index ? { ...s, [shiftKey]: { ...s[shiftKey], ...patch } } : s
    );
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Horario de apertura</h3>
          <p className="text-xs text-gray-500 mt-0.5">Configura hasta dos turnos por día (mediodía y noche).</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_SCHEDULE)}
          className="text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer"
        >
          Restaurar
        </button>
      </div>

      {/* Header */}
      <div className="hidden sm:grid grid-cols-[9rem_1fr_1fr] gap-3 px-1 pb-1 text-xs text-gray-400 uppercase tracking-wider">
        <span>Día</span>
        <span>1er turno</span>
        <span>2º turno</span>
      </div>

      {schedule.map((entry, i) => (
        <div
          key={entry.day}
          className="grid grid-cols-1 sm:grid-cols-[9rem_1fr_1fr] gap-2 py-2.5 border-b border-gray-100 last:border-0 items-center"
        >
          <span className="text-sm font-medium text-gray-800">{DAY_LABELS[entry.day] ?? entry.day}</span>
          <ShiftRow label="Mediodía" shift={entry.shift1} onChange={(patch) => updateShift(i, 'shift1', patch)} />
          <ShiftRow label="Noche" shift={entry.shift2} onChange={(patch) => updateShift(i, 'shift2', patch)} />
        </div>
      ))}
    </div>
  );
}
