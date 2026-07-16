export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export async function setupFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const WIZARD_STEPS = [
  { id: 'identidad',   label: 'Identidad',        icon: '🏪', required: true  },
  { id: 'fiscalidad',  label: 'Fiscalidad',        icon: '📋', required: true  },
  { id: 'servicios',   label: 'Servicios',         icon: '⚙️', required: false },
  { id: 'horarios',    label: 'Horarios',          icon: '🕐', required: false },
  { id: 'zonas',       label: 'Zonas y mesas',     icon: '🗺️', required: false },
  { id: 'carta',       label: 'Carta',             icon: '🍽️', required: true  },
  { id: 'usuarios',    label: 'Usuarios',          icon: '👥', required: true  },
  { id: 'caja',        label: 'Caja',              icon: '💰', required: false },
  { id: 'impresoras',  label: 'Impresoras',        icon: '🖨️', required: false },
  { id: 'kds',         label: 'KDS',              icon: '📺', required: false },
  { id: 'reservas',    label: 'Reservas',          icon: '📅', required: false },
  { id: 'stock',       label: 'Stock',             icon: '📦', required: false },
  { id: 'copias',      label: 'Copias de seg.',    icon: '💾', required: true  },
  { id: 'diagnostico', label: 'Diagnóstico',       icon: '🔍', required: false },
  { id: 'simulacion',  label: 'Simulación',        icon: '🎮', required: false },
  { id: 'produccion',  label: 'Puesta en marcha',  icon: '🚀', required: true  },
] as const;

export type StepId = typeof WIZARD_STEPS[number]['id'];

export const STEP_IDS = WIZARD_STEPS.map((s) => s.id);

export function stepIndex(id: string): number {
  return WIZARD_STEPS.findIndex((s) => s.id === id);
}

export function nextStep(id: string): StepId | null {
  const idx = stepIndex(id);
  return idx >= 0 && idx < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[idx + 1].id : null;
}

export function prevStep(id: string): StepId | null {
  const idx = stepIndex(id);
  return idx > 0 ? WIZARD_STEPS[idx - 1].id : null;
}

export interface StepProps {
  sessionId: string;
  stepData: Record<string, unknown>;
  onNext: () => void;
  onBack: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onSkip: () => void;
}
