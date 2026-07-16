import React, { useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch } from '../setupUtils';

interface ServiceToggles {
  sala: boolean;
  barra: boolean;
  terraza: boolean;
  takeaway: boolean;
  delivery: boolean;
  qr_menu: boolean;
  reservas: boolean;
  fichaje: boolean;
  stock: boolean;
  online_orders: boolean;
  crm: boolean;
  kds: boolean;
}

const SERVICE_DEFS: { id: keyof ServiceToggles; icon: string; label: string; desc: string; default: boolean }[] = [
  { id: 'sala',          icon: '🪑', label: 'Sala / mesas',               desc: 'Gestión de pedidos por mesa en sala', default: true  },
  { id: 'barra',         icon: '🍺', label: 'Barra / mostrador',           desc: 'Pedidos rápidos en barra o mostrador', default: true  },
  { id: 'terraza',       icon: '☀️', label: 'Terraza exterior',             desc: 'Zona de terraza con mesas exteriores', default: false },
  { id: 'takeaway',      icon: '🥡', label: 'Para llevar / recogida',       desc: 'Pedidos para llevar y recogida en local', default: true  },
  { id: 'delivery',      icon: '🛵', label: 'Reparto a domicilio',           desc: 'Entrega a domicilio con repartidores', default: false },
  { id: 'qr_menu',       icon: '📱', label: 'Carta QR (menú digital)',       desc: 'Carta digital que los clientes leen con el móvil', default: false },
  { id: 'reservas',      icon: '📅', label: 'Reservas online',              desc: 'Gestión de reservas y lista de espera', default: false },
  { id: 'fichaje',       icon: '⏱️', label: 'Control de fichaje',           desc: 'Registro de entradas y salidas del personal', default: false },
  { id: 'stock',         icon: '📦', label: 'Gestión de stock',             desc: 'Control de ingredientes, inventario y escandallos', default: false },
  { id: 'online_orders', icon: '🌐', label: 'Pedidos online (agregadores)', desc: 'Glovo, Uber Eats, Just Eat y otros', default: false },
  { id: 'crm',           icon: '⭐', label: 'CRM y fidelización',           desc: 'Clientes habituales, puntos y tarjetas regalo', default: false },
  { id: 'kds',           icon: '📺', label: 'Pantalla KDS de cocina',       desc: 'Pantalla en cocina que muestra las comandas', default: true  },
];

export default function SetupServicios({ sessionId, onNext, onBack, onSave, onSkip }: StepProps) {
  const [services, setServices] = useState<ServiceToggles>(() => {
    const d: Partial<ServiceToggles> = {};
    SERVICE_DEFS.forEach((s) => { d[s.id] = s.default; });
    return d as ServiceToggles;
  });
  const [saving, setSaving] = useState(false);

  function toggle(id: keyof ServiceToggles) {
    setServices((s) => ({ ...s, [id]: !s[id] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setupFetch(`/api/setup/session/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { servicios: services } }),
      });
      onSave({ servicios: services });
      toast.success('Servicios guardados');
      onNext();
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">⚙️ Servicios activos</h2>
      <p className="text-zinc-500 mb-6">Activa los módulos que vas a usar en tu restaurante. Puedes cambiarlos en cualquier momento.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SERVICE_DEFS.map((svc) => (
          <button
            key={svc.id}
            onClick={() => toggle(svc.id)}
            className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
              services[svc.id]
                ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/15'
                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
              services[svc.id] ? 'bg-amber-500 border-amber-500' : 'border-zinc-600 bg-zinc-800'
            }`}>
              {services[svc.id] && <span className="text-zinc-900 text-xs font-bold">✓</span>}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span>{svc.icon}</span>
                <span className={`font-medium text-sm ${services[svc.id] ? 'text-amber-300' : 'text-zinc-300'}`}>{svc.label}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{svc.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-zinc-600 mt-4">* Puedes activar o desactivar módulos más adelante desde el panel de administración.</p>

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
