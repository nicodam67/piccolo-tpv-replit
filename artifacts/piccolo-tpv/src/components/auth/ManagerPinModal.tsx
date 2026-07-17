/**
 * ManagerPinModal — requests manager/admin PIN authorization for sensitive operations.
 *
 * Usage:
 *   const { requestAuth, ManagerPinModal } = useManagerAuth();
 *   ...
 *   <button onClick={() => requestAuth('discount.large', 'Descuento > 20%', handleApply)}>
 *     Aplicar
 *   </button>
 *   <ManagerPinModal />
 */
import React, { useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from 'sonner';
import { useGetEmployeeLoginList } from '@workspace/api-client-react';

export interface ManagerAuthRequest {
  operation: string;
  label: string;
  onAuthorized: (token: string) => void | Promise<void>;
}

interface ManagerPinModalProps {
  request: ManagerAuthRequest | null;
  onClose: () => void;
}

export function ManagerPinModal({ request, onClose }: ManagerPinModalProps) {
  const { data: employees = [] } = useGetEmployeeLoginList();
  const managerEmployees = employees.filter(() => true); // All employees shown; backend validates role

  const [selectedId, setSelectedId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!request) return null;

  const handleAuthorize = async () => {
    if (!selectedId) { setError('Selecciona un encargado'); return; }
    if (pin.length < 4)  { setError('Introduce el PIN'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await api.post<{ authorized: boolean; token: string }>(
        '/api/auth/manager-authorize',
        { managerId: selectedId, pin, operation: request.operation }
      );
      onClose();
      await request.onAuthorized(result.token);
    } catch (err: any) {
      setError(err?.message ?? 'PIN incorrecto o sin permisos');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && selectedId && pin.length >= 4) void handleAuthorize();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <ShieldCheck size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="font-black text-sm">Autorización de encargado</h3>
              <p className="text-xs text-muted-foreground">{request.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Employee selector */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
              Encargado / Administrador
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
              {managerEmployees.map(emp => (
                <button key={emp.id} onClick={() => setSelectedId(emp.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition-all border-2 ${
                    selectedId === emp.id
                      ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                      : 'border-border text-muted-foreground hover:border-amber-400/40'
                  }`}>
                  {emp.name}
                </button>
              ))}
            </div>
          </div>

          {/* PIN input */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={handleKey}
              autoFocus
              placeholder="••••"
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-2xl font-black font-mono text-center tracking-widest focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive font-semibold text-center">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl text-sm">
            Cancelar
          </button>
          <button
            onClick={handleAuthorize}
            disabled={loading || !selectedId || pin.length < 4}
            className="flex-1 py-3 bg-amber-500 text-white font-black rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-amber-400 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck size={15} />}
            Autorizar
          </button>
        </div>
      </div>
    </div>
  );
}
