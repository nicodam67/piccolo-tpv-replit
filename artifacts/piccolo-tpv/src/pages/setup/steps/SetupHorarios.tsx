import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch } from '../setupUtils';

const DAYS = [
  { id: 'mon', label: 'Lunes' },
  { id: 'tue', label: 'Martes' },
  { id: 'wed', label: 'Miércoles' },
  { id: 'thu', label: 'Jueves' },
  { id: 'fri', label: 'Viernes' },
  { id: 'sat', label: 'Sábado' },
  { id: 'sun', label: 'Domingo' },
];

type DaySchedule = {
  open: string;
  close: string;
  open2?: string;
  close2?: string;
};

type Hours = Record<string, DaySchedule | undefined>;

const DEFAULT_DAY: DaySchedule = { open: '12:00', close: '16:00', open2: '19:00', close2: '23:00' };

export default function SetupHorarios({ onNext, onBack, onSkip }: StepProps) {
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => ({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: false,
  }));
  const [hours, setHours] = useState<Hours>(() => {
    const h: Hours = {};
    DAYS.forEach((d) => { h[d.id] = { ...DEFAULT_DAY }; });
    return h;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setupFetch<Record<string, unknown>>('/api/config/business')
      .then((d) => {
        const oh = d.openingHours as Hours | null;
        if (oh && Object.keys(oh).length > 0) {
          const newOpen: Record<string, boolean> = {};
          const newHours: Hours = {};
          DAYS.forEach((day) => {
            if (oh[day.id]) {
              newOpen[day.id] = true;
              newHours[day.id] = oh[day.id];
            } else {
              newOpen[day.id] = false;
              newHours[day.id] = { ...DEFAULT_DAY };
            }
          });
          setOpenDays(newOpen);
          setHours(newHours);
        }
      })
      .catch(() => {});
  }, []);

  function setField(dayId: string, field: keyof DaySchedule, value: string) {
    setHours((h) => ({
      ...h,
      [dayId]: { ...(h[dayId] ?? DEFAULT_DAY), [field]: value },
    }));
  }

  function copyToWeekdays() {
    const fri = hours['fri'] ?? DEFAULT_DAY;
    const updates: Hours = {};
    ['mon', 'tue', 'wed', 'thu', 'fri'].forEach((d) => {
      updates[d] = { ...fri };
    });
    setHours((h) => ({ ...h, ...updates }));
    setOpenDays((o) => ({ ...o, mon: true, tue: true, wed: true, thu: true, fri: true }));
    toast.success('Horario copiado a días laborables');
  }

  function copyToWeekend() {
    const fri = hours['fri'] ?? DEFAULT_DAY;
    const updates: Hours = {};
    ['sat', 'sun'].forEach((d) => { updates[d] = { ...fri }; });
    setHours((h) => ({ ...h, ...updates }));
    setOpenDays((o) => ({ ...o, sat: true, sun: true }));
    toast.success('Horario copiado al fin de semana');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const openingHours: Hours = {};
      DAYS.forEach((d) => {
        if (openDays[d.id]) openingHours[d.id] = hours[d.id] ?? DEFAULT_DAY;
      });
      await setupFetch('/api/admin/branding', {
        method: 'PATCH',
        body: JSON.stringify({ openingHours }),
      });
      toast.success('Horarios guardados');
      onNext();
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🕐 Horarios de apertura</h2>
      <p className="text-zinc-500 mb-4">Define los días y horarios en que tu restaurante está abierto.</p>

      <div className="flex gap-3 mb-6">
        <button onClick={copyToWeekdays} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
          Copiar a L–V
        </button>
        <button onClick={copyToWeekend} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
          Copiar a S–D
        </button>
      </div>

      <div className="space-y-3">
        {DAYS.map((day) => {
          const h = hours[day.id] ?? DEFAULT_DAY;
          const isOpen = openDays[day.id];
          return (
            <div key={day.id} className={`bg-zinc-900 border rounded-xl p-4 transition-colors ${isOpen ? 'border-zinc-700' : 'border-zinc-800 opacity-60'}`}>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setOpenDays((o) => ({ ...o, [day.id]: !o[day.id] }))}
                  className={`w-10 h-5 rounded-full transition-colors relative ${isOpen ? 'bg-amber-500' : 'bg-zinc-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${isOpen ? 'left-5.5' : 'left-0.5'}`} style={{ left: isOpen ? 22 : 2 }} />
                </button>
                <span className="font-medium text-zinc-200 w-24">{day.label}</span>
                {!isOpen && <span className="text-xs text-zinc-600">Cerrado</span>}
              </div>
              {isOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Apertura 1</label>
                    <input type="time" value={h.open} onChange={(e) => setField(day.id, 'open', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Cierre 1</label>
                    <input type="time" value={h.close} onChange={(e) => setField(day.id, 'close', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Apertura 2 (opcional)</label>
                    <input type="time" value={h.open2 ?? ''} onChange={(e) => setField(day.id, 'open2', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Cierre 2 (opcional)</label>
                    <input type="time" value={h.close2 ?? ''} onChange={(e) => setField(day.id, 'close2', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Omitir</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar y continuar →'}
          </button>
        </div>
      </div>
    </div>
  );
}
