import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { BASE, WIZARD_STEPS, setupFetch, stepIndex, nextStep, prevStep, StepId } from './setupUtils';

import SetupIdentidad from './steps/SetupIdentidad';
import SetupFiscalidad from './steps/SetupFiscalidad';
import SetupServicios from './steps/SetupServicios';
import SetupHorarios from './steps/SetupHorarios';
import SetupZonas from './steps/SetupZonas';
import SetupCarta from './steps/SetupCarta';
import SetupUsuarios from './steps/SetupUsuarios';
import SetupCaja from './steps/SetupCaja';
import SetupImpresoras from './steps/SetupImpresoras';
import SetupKDS from './steps/SetupKDS';
import SetupReservas from './steps/SetupReservas';
import SetupStock from './steps/SetupStock';
import SetupBackup from './steps/SetupBackup';
import SetupDiagnostico from './steps/SetupDiagnostico';
import SetupSimulacion from './steps/SetupSimulacion';
import SetupProduccion from './steps/SetupProduccion';

interface Session {
  id: string;
  mode: string;
  currentStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  data: Record<string, unknown>;
}

const MODE_LABELS: Record<string, string> = {
  full: 'Configuración inicial',
  quick: 'Configuración rápida',
  review: 'Revisión',
  add_printer: 'Añadir impresora',
  add_kds: 'Añadir KDS',
  add_zone: 'Añadir zona',
  add_user: 'Añadir usuario',
  add_device: 'Añadir dispositivo',
  change_venue: 'Cambiar local',
  recover: 'Recuperación',
};

const STEP_COMPONENTS: Record<string, React.ComponentType<any>> = {
  identidad: SetupIdentidad,
  fiscalidad: SetupFiscalidad,
  servicios: SetupServicios,
  horarios: SetupHorarios,
  zonas: SetupZonas,
  carta: SetupCarta,
  usuarios: SetupUsuarios,
  caja: SetupCaja,
  impresoras: SetupImpresoras,
  kds: SetupKDS,
  reservas: SetupReservas,
  stock: SetupStock,
  copias: SetupBackup,
  diagnostico: SetupDiagnostico,
  simulacion: SetupSimulacion,
  produccion: SetupProduccion,
};

export default function SetupWizardPage() {
  const params = useParams<{ sessionId: string; step: string }>();
  const [, navigate] = useLocation();

  const sessionId = params.sessionId;
  const currentStepId = params.step as StepId;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setupFetch<Session>(`/api/setup/session/${sessionId}`)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  /**
   * Returns true on success, false on failure.
   * Callers must check the return value and NOT navigate on failure.
   */
  const patchSession = useCallback(async (updates: Partial<Session>): Promise<boolean> => {
    if (!sessionId) return false;
    try {
      const updated = await setupFetch<Session>(`/api/setup/session/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setSession(updated);
      return true;
    } catch (e: unknown) {
      toast.error('Error al guardar progreso: ' + (e as Error).message);
      return false;
    }
  }, [sessionId]);

  const goToStep = useCallback((stepId: string) => {
    navigate(`/setup/${sessionId}/${stepId}`);
  }, [sessionId, navigate]);

  const handleNext = useCallback(async () => {
    if (!currentStepId || !session) return;
    const completed = session.completedSteps.includes(currentStepId)
      ? session.completedSteps
      : [...session.completedSteps, currentStepId];

    const next = nextStep(currentStepId);
    const ok = await patchSession({ currentStep: next ?? currentStepId, completedSteps: completed });
    // Fail-closed: only navigate when session persistence succeeded
    if (ok && next) goToStep(next);
  }, [currentStepId, session, patchSession, goToStep]);

  const handleBack = useCallback(() => {
    const prev = prevStep(currentStepId);
    if (prev) goToStep(prev);
  }, [currentStepId, goToStep]);

  const handleSkip = useCallback(async () => {
    if (!currentStepId || !session) return;
    const skipped = session.skippedSteps.includes(currentStepId)
      ? session.skippedSteps
      : [...session.skippedSteps, currentStepId];
    const next = nextStep(currentStepId);
    const ok = await patchSession({ currentStep: next ?? currentStepId, skippedSteps: skipped });
    // Fail-closed: only navigate when session persistence succeeded
    if (ok && next) goToStep(next);
  }, [currentStepId, session, patchSession, goToStep]);

  const handleSave = useCallback(async (data: Record<string, unknown>) => {
    await patchSession({ data });
  }, [patchSession]);

  const handleSaveAndExit = useCallback(async () => {
    setSaving(true);
    await patchSession({ currentStep: currentStepId });
    setSaving(false);
    navigate('/admin');
  }, [currentStepId, patchSession, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full mr-3" />
        Cargando asistente…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-400">
        <p>Sesión no encontrada.</p>
        <a href={`${BASE}/setup`} className="text-amber-400 underline">Iniciar nueva configuración</a>
      </div>
    );
  }

  const completedCount = session.completedSteps.length;
  const totalSteps = WIZARD_STEPS.length;
  const pct = Math.round((completedCount / totalSteps) * 100);

  const StepComponent = STEP_COMPONENTS[currentStepId];
  const stepData = (session.data as Record<string, Record<string, unknown>>)?.[currentStepId] ?? {};
  const currentIdx = stepIndex(currentStepId);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center gap-4">
        <a href={`${BASE}/setup`} className="text-zinc-500 hover:text-zinc-300 text-sm">← Inicio</a>
        <span className="text-zinc-100 font-semibold">Piccolo Setup</span>
        <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded text-xs border border-amber-500/25 font-medium">
          {MODE_LABELS[session.mode] ?? session.mode}
        </span>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-2 ml-2">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500 whitespace-nowrap">{pct}% completado</span>
        </div>

        <button
          onClick={handleSaveAndExit}
          disabled={saving}
          className="text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
        >
          {saving ? 'Guardando…' : 'Guardar y salir'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
          <div className="p-2">
            {WIZARD_STEPS.map((step, idx) => {
              const isCurrent = step.id === currentStepId;
              const isDone = session.completedSteps.includes(step.id);
              const isSkipped = session.skippedSteps.includes(step.id);

              let iconEl: React.ReactNode;
              if (isDone) iconEl = <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">✓</span>;
              else if (isSkipped) iconEl = <span className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-500 flex items-center justify-center text-xs">↷</span>;
              else if (isCurrent) iconEl = <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs">→</span>;
              else iconEl = <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-600 flex items-center justify-center text-xs">{idx + 1}</span>;

              return (
                <button
                  key={step.id}
                  onClick={() => goToStep(step.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${
                    isCurrent
                      ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500'
                      : isDone
                      ? 'text-zinc-400 hover:bg-zinc-800'
                      : 'text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400'
                  }`}
                >
                  {iconEl}
                  <span className="truncate">{step.icon} {step.label}</span>
                  {step.required && !isDone && !isSkipped && (
                    <span className="ml-auto text-xs text-amber-500/60">*</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Breadcrumb */}
            <p className="text-xs text-zinc-600 mb-1">
              Paso {currentIdx + 1} de {totalSteps}
            </p>

            {StepComponent ? (
              <StepComponent
                sessionId={sessionId}
                stepData={stepData}
                onNext={handleNext}
                onBack={handleBack}
                onSave={handleSave}
                onSkip={handleSkip}
              />
            ) : (
              <div className="text-zinc-500">Paso no encontrado: {currentStepId}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
