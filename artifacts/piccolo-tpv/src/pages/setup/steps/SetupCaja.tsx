import React, { useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

const PAYMENT_METHODS = [
  { id: 'efectivo',           label: 'Efectivo',             icon: '💶', default: true  },
  { id: 'tarjeta',            label: 'Tarjeta bancaria',      icon: '💳', default: true  },
  { id: 'bizum',              label: 'Bizum',                 icon: '📱', default: false },
  { id: 'ticket_restaurant',  label: 'Ticket Restaurant',     icon: '🎟️', default: false },
  { id: 'vale_comida',        label: 'Vale comida / cheque',  icon: '📄', default: false },
];

export default function SetupCaja({ sessionId, onNext, onBack, onSave, onSkip }: StepProps) {
  const [form, setForm] = useState({ terminalName: 'Caja 1', openingFloat: 0 });
  const [payMethods, setPayMethods] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {};
    PAYMENT_METHODS.forEach((m) => { d[m.id] = m.default; });
    return d;
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const data = { terminalName: form.terminalName, openingFloat: form.openingFloat, paymentMethods: payMethods };
      await setupFetch(`/api/setup/session/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { caja: data } }),
      });
      onSave({ caja: data });
      toast.success('Configuración de caja guardada');
      onNext();
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">💰 Caja y formas de pago</h2>
      <p className="text-zinc-500 mb-6">Configura el terminal y las formas de pago aceptadas.</p>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> La caja se abre manualmente al comenzar el turno desde el menú principal. El importe de apertura es el efectivo inicial en caja. Las formas de pago se muestran al cobrar pedidos.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Nombre del terminal</label>
          <input value={form.terminalName}
            onChange={(e) => setForm((f) => ({ ...f, terminalName: e.target.value }))}
            placeholder="Ej: Caja 1, Terminal barra"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Importe de apertura habitual (€)</label>
          <input value={form.openingFloat} type="number" step="0.01" min="0"
            onChange={(e) => setForm((f) => ({ ...f, openingFloat: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Formas de pago aceptadas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button key={m.id} onClick={() => setPayMethods((p) => ({ ...p, [m.id]: !p[m.id] }))}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                payMethods[m.id]
                  ? 'bg-amber-500/10 border-amber-500/40'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}>
              <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                payMethods[m.id] ? 'bg-amber-500 border-amber-500' : 'border-zinc-600 bg-zinc-800'
              }`}>
                {payMethods[m.id] && <span className="text-zinc-900 text-xs font-bold">✓</span>}
              </div>
              <span>{m.icon}</span>
              <span className={`text-sm font-medium ${payMethods[m.id] ? 'text-amber-300' : 'text-zinc-300'}`}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-sm text-zinc-400 mb-2">Para abrir y gestionar la caja en tiempo real:</p>
        <a href={`${BASE}/caja`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 text-sm underline">
          Ir a la caja →
        </a>
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
