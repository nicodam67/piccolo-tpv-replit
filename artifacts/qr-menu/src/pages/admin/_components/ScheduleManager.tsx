import { Switch } from "@/components/ui/switch.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

export type Shift = {
  open: boolean;
  openTime: string;
  closeTime: string;
};

export type DaySchedule = {
  day: string;
  shift1: Shift;
  shift2: Shift;
};

const DAY_LABELS: Record<string, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

export const DEFAULT_SCHEDULE: DaySchedule[] = [
  { day: "monday",    shift1: { open: true,  openTime: "13:00", closeTime: "16:00" }, shift2: { open: true,  openTime: "20:00", closeTime: "23:30" } },
  { day: "tuesday",   shift1: { open: true,  openTime: "13:00", closeTime: "16:00" }, shift2: { open: true,  openTime: "20:00", closeTime: "23:30" } },
  { day: "wednesday", shift1: { open: true,  openTime: "13:00", closeTime: "16:00" }, shift2: { open: true,  openTime: "20:00", closeTime: "23:30" } },
  { day: "thursday",  shift1: { open: true,  openTime: "13:00", closeTime: "16:00" }, shift2: { open: true,  openTime: "20:00", closeTime: "23:30" } },
  { day: "friday",    shift1: { open: true,  openTime: "13:00", closeTime: "16:00" }, shift2: { open: true,  openTime: "20:00", closeTime: "00:00" } },
  { day: "saturday",  shift1: { open: true,  openTime: "13:00", closeTime: "16:30" }, shift2: { open: true,  openTime: "20:00", closeTime: "00:00" } },
  { day: "sunday",    shift1: { open: true,  openTime: "13:00", closeTime: "16:30" }, shift2: { open: false, openTime: "20:00", closeTime: "23:00" } },
];

type Props = {
  schedule: DaySchedule[];
  onChange: (schedule: DaySchedule[]) => void;
};

function ShiftRow({
  label,
  shift,
  onChange,
}: {
  label: string;
  shift: Shift;
  onChange: (patch: Partial<Shift>) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Switch
        checked={shift.open}
        onCheckedChange={(val) => onChange({ open: val })}
        className="cursor-pointer shrink-0"
      />
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      {shift.open ? (
        <>
          <Input
            type="time"
            value={shift.openTime}
            onChange={(e) => onChange({ openTime: e.target.value })}
            className="w-24 h-7 text-xs"
          />
          <span className="text-muted-foreground text-xs shrink-0">–</span>
          <Input
            type="time"
            value={shift.closeTime}
            onChange={(e) => onChange({ closeTime: e.target.value })}
            className="w-24 h-7 text-xs"
          />
        </>
      ) : (
        <span className="text-xs text-muted-foreground italic">Cerrado</span>
      )}
    </div>
  );
}

export default function ScheduleManager({ schedule, onChange }: Props) {
  function updateShift(index: number, shiftKey: "shift1" | "shift2", patch: Partial<Shift>) {
    const updated = schedule.map((s, i) =>
      i === index ? { ...s, [shiftKey]: { ...s[shiftKey], ...patch } } : s
    );
    onChange(updated);
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="hidden sm:grid grid-cols-[9rem_1fr_1fr] gap-3 px-1 pb-1 text-xs text-muted-foreground/70 uppercase tracking-wider">
        <span>Día</span>
        <span>1er turno</span>
        <span>2º turno</span>
      </div>

      {schedule.map((entry, i) => (
        <div
          key={entry.day}
          className="grid grid-cols-1 sm:grid-cols-[9rem_1fr_1fr] gap-2 py-2.5 border-b border-border/40 last:border-0 items-center"
        >
          {/* Day name */}
          <span className="text-sm font-medium">
            {DAY_LABELS[entry.day] ?? entry.day}
          </span>

          {/* Shift 1 */}
          <ShiftRow
            label="Mediodía"
            shift={entry.shift1}
            onChange={(patch) => updateShift(i, "shift1", patch)}
          />

          {/* Shift 2 */}
          <ShiftRow
            label="Noche"
            shift={entry.shift2}
            onChange={(patch) => updateShift(i, "shift2", patch)}
          />
        </div>
      ))}
    </div>
  );
}
