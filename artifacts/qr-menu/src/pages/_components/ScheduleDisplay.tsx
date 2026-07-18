import { useTranslation } from "react-i18next";
import type { DaySchedule } from "../admin/_components/ScheduleManager.tsx";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DAY_I18N: Record<DayKey, string> = {
  monday: "schedule.monday",
  tuesday: "schedule.tuesday",
  wednesday: "schedule.wednesday",
  thursday: "schedule.thursday",
  friday: "schedule.friday",
  saturday: "schedule.saturday",
  sunday: "schedule.sunday",
};

// Fallback day names used if translation key not found
const DAY_FALLBACK: Record<DayKey, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

function getTodayKey(): string {
  return DAY_KEYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
}

function formatShift(shift: { open: boolean; openTime: string; closeTime: string }): string {
  if (!shift.open) return "";
  return `${shift.openTime} – ${shift.closeTime}`;
}

type Props = {
  schedule: DaySchedule[];
};

export default function ScheduleDisplay({ schedule }: Props) {
  const { t } = useTranslation("common");
  const todayKey = getTodayKey();

  return (
    <div className="space-y-0.5 text-sm">
      {schedule.map((entry) => {
        const isToday = entry.day === todayKey;
        const s1 = formatShift(entry.shift1);
        const s2 = formatShift(entry.shift2);
        const isClosed = !entry.shift1.open && !entry.shift2.open;
        const dayKey = entry.day as DayKey;
        const dayLabel = t(DAY_I18N[dayKey], { defaultValue: DAY_FALLBACK[dayKey] ?? entry.day });

        return (
          <div
            key={entry.day}
            className={`flex items-center justify-between py-1.5 border-b border-border/20 last:border-0 gap-4 ${
              isToday ? "font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            <span className="flex items-center gap-1.5 w-24 shrink-0">
              {isToday && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              )}
              {dayLabel}
            </span>

            {isClosed ? (
              <span className="italic text-muted-foreground">{t("schedule.closed")}</span>
            ) : (
              <div className="flex flex-col items-end gap-0.5 text-right">
                {s1 && (
                  <span className="text-xs">
                    <span className="text-muted-foreground font-normal mr-1">{t("schedule.midday")}</span>
                    {s1}
                  </span>
                )}
                {s2 && (
                  <span className="text-xs">
                    <span className="text-muted-foreground font-normal mr-1">{t("schedule.evening")}</span>
                    {s2}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
