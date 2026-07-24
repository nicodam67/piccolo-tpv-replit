/**
 * FichajePortalEmpleado — vista personal del empleado autenticado.
 * Usa getFichajeMe + getTimeclockRecords (mes actual).
 */
import { useState, useEffect } from "react";
import { UserCircle, Clock, LogIn, LogOut, Calendar, BarChart3 } from "lucide-react";
import { getFichajeMe, getTimeclockRecords } from "@workspace/api-client-react/timeclock";
import type { TimeclockRecord, TimeclockRecordListItem } from "@workspace/api-client-react/timeclock";

interface MeData {
  employee: { id: string; name: string; role: string };
  openRecord: TimeclockRecord | null;
  recentRecords: TimeclockRecordListItem[];
  monthMinutes: number;
}

function durationMins(a: string, b: string | null | undefined) {
  return Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function FichajePortalEmpleado() {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    Promise.all([
      getFichajeMe(),
      getTimeclockRecords({
        from: monthStart.toISOString(),
        to: new Date().toISOString(),
      }),
    ])
      .then(([me, records]) => {
        const monthMinutes = records.reduce((acc, r) => {
          if (!r.clockOut) return acc;
          return acc + durationMins(r.clockIn, r.clockOut);
        }, 0);
        setData({
          employee: me.employee,
          openRecord: me.currentRecord ?? null,
          recentRecords: records.slice(0, 10),
          monthMinutes,
        });
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-center text-muted-foreground py-16">Cargando tu perfil…</div>;
  if (error || !data) return (
    <div className="p-6 text-center py-16 text-muted-foreground">
      <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No se pudo cargar el portal</p>
      <p className="text-sm mt-1">{error ?? "Debes estar autenticado"}</p>
    </div>
  );

  const { employee, openRecord, recentRecords, monthMinutes } = data;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center text-2xl font-bold">
          {employee.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{employee.name}</h1>
          <p className="text-muted-foreground text-sm capitalize">{employee.role}</p>
        </div>
      </div>

      <div className={`rounded-2xl p-5 mb-6 border ${openRecord ? "bg-green-500/10 border-green-500/20" : "bg-card border-border"}`}>
        <div className="flex items-center gap-3">
          {openRecord ? (
            <>
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400">En turno</p>
                <p className="text-sm text-green-600/70">Entrada: {fmtDateTime(openRecord.clockIn)} · {fmtDuration(durationMins(openRecord.clockIn, null))} trabajados</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <div>
                <p className="font-semibold text-foreground">Fuera de turno</p>
                <p className="text-sm text-muted-foreground">No hay turno abierto</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <BarChart3 size={16} />
            <span className="text-sm">Horas este mes</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{fmtDuration(monthMinutes ?? 0)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Calendar size={16} />
            <span className="text-sm">Registros recientes</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{recentRecords.length}</div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Últimos registros</h2>
        {recentRecords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin registros recientes</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentRecords.map(r => {
              const mins = r.clockOut ? durationMins(r.clockIn, r.clockOut) : null;
              return (
                <div key={r.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <LogIn size={13} className="text-green-500" />
                      {fmtDateTime(r.clockIn)}
                      {r.clockOut && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <LogOut size={13} className="text-red-400" />
                          {fmtDateTime(r.clockOut)}
                        </>
                      )}
                    </div>
                    {r.isManual && <p className="text-xs text-amber-600 mt-0.5">Registro manual</p>}
                  </div>
                  {mins !== null && (
                    <span className="text-sm font-medium text-foreground shrink-0">{fmtDuration(mins)}</span>
                  )}
                  {!r.clockOut && (
                    <span className="text-xs text-green-600 font-medium shrink-0 animate-pulse">En curso</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
