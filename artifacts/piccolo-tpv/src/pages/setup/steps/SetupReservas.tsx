import React, { useEffect, useState } from 'react';
import { StepProps, setupFetch, BASE } from '../setupUtils';

interface Shift { id: string; name: string; startTime: string; endTime: string; }

export default function SetupReservas({ onNext, onBack, onSkip }: StepProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setupFetch<Shift[]>('/api/service-shifts')
      .then((d) => setShifts(Array.isArray(d) ? d : []))
      .catch(() => setShifts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">📅 Reservas</h2>
      <p className="text-zinc-500 mb-6">Configura el módulo de reservas y turnos de servicio para tu restaurante.</p>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> Las reservas se gestionan por turnos de servicio (comida, cena…). Configura la capacidad de cada turno para evitar sobreventas.
      </div>

      {/* Module overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { icon: '📅', title: 'Agenda de reservas', desc: 'Calendario visual con estado de cada mesa' },
          { icon: '🕐', title: 'Turnos de servicio', desc: 'Define los turnos y su capacidad máxima' },
          { icon: '📋', title: 'Lista de espera', desc: 'Gestiona clientes en espera de mesa' },
        ].map((item) => (
          <div key={item.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-2xl mb-2">{item.icon}</div>
            <h3 className="font-medium text-zinc-200 text-sm mb-1">{item.title}</h3>
            <p className="text-xs text-zinc-500">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Existing shifts */}
      {!loading && shifts.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-zinc-300 mb-3">Turnos configurados ({shifts.length})</h3>
          <div className="space-y-2">
            {shifts.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
                <span className="text-zinc-300 text-sm font-medium">{s.name}</span>
                <span className="text-xs text-zinc-500">{s.startTime} – {s.endTime}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-zinc-300">Gestionar módulo de reservas:</p>
        <div className="flex flex-wrap gap-3">
          <a href={`${BASE}/reservas`} target="_blank" rel="noreferrer"
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/25 rounded-lg text-sm transition-colors">
            📅 Agenda de reservas →
          </a>
          <a href={`${BASE}/admin/reservas/turnos`} target="_blank" rel="noreferrer"
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/25 rounded-lg text-sm transition-colors">
            🕐 Turnos de servicio →
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm">Omitir este módulo</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm">
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
