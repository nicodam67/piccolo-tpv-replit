import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

interface BackupRecord {
  id: string;
  createdAt: string;
  status: string;
  verified: boolean;
  backupType: string;
  sizeBytes: number;
}

export default function SetupBackup({ onNext, onBack, onSkip }: StepProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  async function loadBackups() {
    setLoading(true);
    try {
      const r = await setupFetch<{ data: BackupRecord[] }>('/api/backup/list?limit=5');
      setBackups(r.data ?? []);
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }

  async function createBackup() {
    setCreating(true);
    try {
      const r = await setupFetch<{ backupId: string }>('/api/backup/create', {
        method: 'POST',
        body: JSON.stringify({ backupType: 'full', notes: 'Copia inicial del asistente de configuración' }),
      });
      toast.success('Copia de seguridad iniciada…');
      // Wait 3s for async backup to complete, then reload
      setTimeout(async () => {
        await loadBackups();
        setCreating(false);
        if (r.backupId) {
          // Auto-verify
          await verifyBackup(r.backupId);
        }
      }, 3500);
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
      setCreating(false);
    }
  }

  async function verifyBackup(id: string) {
    setVerifying(id);
    try {
      const r = await setupFetch<{ ok: boolean; message: string }>(`/api/backup/${id}/verify`, { method: 'POST' });
      if (r.ok) {
        toast.success('✓ Copia verificada correctamente');
      } else {
        toast.error('Error de verificación: ' + r.message);
      }
      await loadBackups();
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setVerifying(null);
    }
  }

  const hasVerified = backups.some((b) => b.verified && b.status === 'valid');

  function fmtSize(bytes: number) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">💾 Copias de seguridad</h2>
      <p className="text-zinc-500 mb-6">Una copia de seguridad verificada es obligatoria antes de activar producción.</p>

      {!hasVerified && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-amber-400 text-xl shrink-0">⚠️</span>
          <div>
            <p className="font-semibold text-amber-300 text-sm">Copia verificada requerida</p>
            <p className="text-xs text-amber-200/70 mt-0.5">Se requiere al menos una copia de seguridad verificada para activar el modo producción.</p>
          </div>
        </div>
      )}

      {hasVerified && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-emerald-400 text-xl">✓</span>
          <p className="text-emerald-300 text-sm font-medium">Tienes una copia verificada. ¡Listo para continuar!</p>
        </div>
      )}

      {/* Backup list */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-4">Cargando copias…</div>
      ) : backups.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 mb-6">
          <p className="text-3xl mb-2">💾</p>
          <p>No hay copias de seguridad aún.</p>
        </div>
      ) : (
        <div className="mb-6 space-y-2">
          {backups.map((b) => (
            <div key={b.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${b.verified ? 'bg-emerald-400' : b.status === 'valid' ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <span className="text-zinc-300 text-sm font-medium">
                    {new Date(b.createdAt).toLocaleString('es-ES')}
                  </span>
                </div>
                <div className="text-xs text-zinc-600 mt-0.5">
                  {b.backupType} · {fmtSize(b.sizeBytes)} · {b.verified ? '✓ Verificada' : b.status}
                </div>
              </div>
              {!b.verified && b.status === 'valid' && (
                <button onClick={() => verifyBackup(b.id)} disabled={verifying === b.id}
                  className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded-lg transition-colors disabled:opacity-60">
                  {verifying === b.id ? 'Verificando…' : 'Verificar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create backup */}
      <div className="flex gap-3 mb-6">
        <button onClick={createBackup} disabled={creating || !!verifying}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
          {creating ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-zinc-900 border-t-transparent rounded-full" />
              Creando copia…
            </>
          ) : (
            '+ Crear primera copia de seguridad'
          )}
        </button>
        <button onClick={loadBackups} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
          ↻ Actualizar
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-sm text-zinc-400 mb-2">Configurar copias automáticas y programadas:</p>
        <a href={`${BASE}/admin/backup`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 text-sm underline">
          Panel de copias de seguridad →
        </a>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm">Omitir</button>
          <button onClick={onNext}
            className={`px-6 py-2 font-semibold rounded-lg text-sm transition-colors ${
              hasVerified
                ? 'bg-amber-500 hover:bg-amber-400 text-zinc-900'
                : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
            }`}
            title={!hasVerified ? 'Crea y verifica una copia antes de continuar' : undefined}
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
