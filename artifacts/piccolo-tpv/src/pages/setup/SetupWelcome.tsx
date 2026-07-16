import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { BASE, setupFetch } from './setupUtils';

interface ModuleCheck {
  status: 'configured' | 'partial' | 'empty';
  count?: number;
  detail?: string;
}

interface DetectResult {
  overall: 'empty' | 'partial' | 'configured';
  recommendedMode: string;
  modules: Record<string, ModuleCheck>;
  checkedAt: string;
}

const MODULE_LABELS: Record<string, string> = {
  identidad: 'Datos del restaurante',
  fiscalidad: 'Fiscalidad y NIF',
  horarios: 'Horarios',
  zonas: 'Zonas y salas',
  mesas: 'Mesas',
  categorias: 'Categorías',
  productos: 'Productos',
  empleados: 'Empleados/Usuarios',
  caja: 'Caja',
  impresoras: 'Impresoras',
  backup: 'Copias de seguridad',
};

const MODES = [
  { id: 'full',         label: 'Configuración inicial completa', desc: 'Configura el sistema desde cero paso a paso', icon: '🚀' },
  { id: 'quick',        label: 'Configuración rápida',           desc: 'Solo los pasos esenciales para empezar',       icon: '⚡' },
  { id: 'review',       label: 'Revisar configuración',          desc: 'Revisa y actualiza la configuración actual',   icon: '🔍' },
  { id: 'add_printer',  label: 'Añadir impresora',               desc: 'Agrega una nueva impresora al sistema',        icon: '🖨️' },
  { id: 'add_kds',      label: 'Añadir pantalla KDS',            desc: 'Configura una nueva pantalla de cocina',       icon: '📺' },
  { id: 'add_zone',     label: 'Añadir zona',                    desc: 'Crea una nueva zona o sala',                   icon: '🗺️' },
  { id: 'add_user',     label: 'Añadir usuario',                 desc: 'Da de alta un nuevo empleado',                 icon: '👤' },
  { id: 'add_device',   label: 'Añadir dispositivo',             desc: 'Registra un nuevo terminal o dispositivo',     icon: '📱' },
  { id: 'change_venue', label: 'Cambiar de local',               desc: 'Actualiza los datos para un local diferente',  icon: '🏪' },
  { id: 'recover',      label: 'Recuperar tras restauración',    desc: 'Verifica la configuración tras restaurar datos',icon: '🔧' },
];

function statusColor(s: string) {
  if (s === 'configured') return 'bg-emerald-400';
  if (s === 'partial') return 'bg-amber-400';
  return 'bg-zinc-600';
}

function overallBadge(overall: string) {
  if (overall === 'configured') return <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium border border-emerald-500/30">✓ Sistema configurado</span>;
  if (overall === 'partial') return <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium border border-amber-500/30">⚡ Configuración parcial</span>;
  return <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium border border-red-500/30">○ Sin configurar</span>;
}

export default function SetupWelcome() {
  const [, navigate] = useLocation();
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setupFetch<DetectResult>('/api/setup/detect')
      .then(setDetect)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function startMode(mode: string) {
    setStarting(mode);
    try {
      const session = await setupFetch<{ id: string }>('/api/setup/session', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      localStorage.setItem('setupSessionId', session.id);
      navigate(`/setup/${session.id}/identidad`);
    } catch (e: unknown) {
      setError((e as Error).message);
      setStarting(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍽️</span>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Piccolo Setup</h1>
            <p className="text-xs text-zinc-500">Asistente de configuración inicial</p>
          </div>
        </div>
        <a href={`${BASE}/admin`} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Volver al panel
        </a>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* State detection */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full mr-3" />
            Analizando configuración actual…
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 mb-6">{error}</div>
        ) : detect ? (
          <>
            {/* Overall status */}
            <div className="mb-8 text-center">
              <div className="mb-3">{overallBadge(detect.overall)}</div>
              <h2 className="text-3xl font-bold text-zinc-100 mb-2">Bienvenido al asistente de configuración</h2>
              <p className="text-zinc-400">Este asistente te guía paso a paso para poner en marcha Piccolo TPV en tu restaurante.</p>
            </div>

            {/* Module grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-10">
              {Object.entries(detect.modules).map(([key, mod]) => (
                <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusColor(mod.status)}`} />
                  <span className="text-xs text-zinc-400 text-center leading-tight">{MODULE_LABELS[key] ?? key}</span>
                  {mod.count !== undefined && <span className="text-xs text-zinc-600">{mod.count}</span>}
                </div>
              ))}
            </div>

            {/* Mode selection */}
            <h3 className="text-lg font-semibold text-zinc-100 mb-4">¿Qué quieres hacer?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODES.map((mode) => {
                const recommended = mode.id === detect.recommendedMode;
                return (
                  <button
                    key={mode.id}
                    onClick={() => startMode(mode.id)}
                    disabled={!!starting}
                    className={`relative flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                      recommended
                        ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800'
                    } ${starting === mode.id ? 'opacity-70' : ''}`}
                  >
                    {recommended && (
                      <span className="absolute top-2 right-2 text-xs bg-amber-500 text-zinc-900 font-bold px-2 py-0.5 rounded-full">
                        Recomendado
                      </span>
                    )}
                    <span className="text-2xl">{mode.icon}</span>
                    <div>
                      <div className={`font-semibold ${recommended ? 'text-amber-400' : 'text-zinc-100'}`}>
                        {mode.label}
                        {starting === mode.id && (
                          <span className="ml-2 inline-block animate-spin w-3 h-3 border border-amber-500 border-t-transparent rounded-full" />
                        )}
                      </div>
                      <div className="text-sm text-zinc-500 mt-0.5">{mode.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
