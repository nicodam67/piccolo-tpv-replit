import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Database, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { customFetch } from '@workspace/api-client-react';

interface DemoCountsResponse {
  tables: Record<string, number>;
  total: number;
}

export default function AdminDatosDemo() {
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const { data, isLoading, refetch } = useQuery<DemoCountsResponse>({
    queryKey: ['admin', 'demo-data', 'counts'],
    queryFn: async () => {
      const r = await customFetch('/admin/demo-data/counts');
      if (!r.ok) throw new Error('Error cargando conteos');
      return r.json();
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async () => {
      const r = await customFetch('/admin/demo-data/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'PURGE_DEMO' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? 'Error al purgar datos');
      }
      return r.json();
    },
    onSuccess: (result) => {
      toast.success(`${result.total} registro(s) de demostración eliminados`);
      setShowConfirm(false);
      setConfirmText('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'demo-data'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const nonZeroTables = data
    ? Object.entries(data.tables).filter(([, n]) => n > 0)
    : [];

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Database className="text-amber-400" size={28} />
        <div>
          <h1 className="text-2xl font-bold">Datos de Demostración</h1>
          <p className="text-sm text-neutral-400">
            Visualiza y elimina los registros de simulación marcados como demo.
            Los datos reales nunca se modifican.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 mb-6">
        <AlertTriangle className="text-amber-400 mt-0.5 shrink-0" size={18} />
        <p className="text-sm text-amber-200">
          Solo se muestran y eliminan los registros con <code className="bg-amber-900/50 px-1 rounded">is_demo = true</code>.
          Los pedidos, tickets y sesiones de caja reales nunca se ven afectados.
        </p>
      </div>

      {/* Counts table */}
      <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="font-semibold text-neutral-100">Registros de demostración por tabla</h2>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>

        {isLoading ? (
          <div className="px-5 py-8 text-center text-neutral-500 text-sm">Cargando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400">
                <th className="text-left px-5 py-3 font-medium">Tabla</th>
                <th className="text-right px-5 py-3 font-medium">Registros demo</th>
                <th className="text-right px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data && Object.entries(data.tables).map(([table, count]) => (
                <tr key={table} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-neutral-300">{table}</td>
                  <td className={`px-5 py-3 text-right font-semibold tabular-nums ${count > 0 ? 'text-amber-400' : 'text-neutral-500'}`}>
                    {count.toLocaleString('es-ES')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {count > 0
                      ? <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">pendiente purga</span>
                      : <span className="text-xs bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full">limpio</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-800/30">
                <td className="px-5 py-3 font-semibold">Total</td>
                <td className={`px-5 py-3 text-right font-bold tabular-nums text-lg ${(data?.total ?? 0) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                  {(data?.total ?? 0).toLocaleString('es-ES')}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Purge section */}
      {(data?.total ?? 0) === 0 ? (
        <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-4 text-sm text-green-300 flex items-center gap-2">
          ✅ No hay datos de demostración. Todas las tablas están limpias.
        </div>
      ) : (
        <div className="bg-neutral-900 rounded-xl border border-red-900/40 p-5">
          <h3 className="font-semibold text-red-400 mb-1 flex items-center gap-2">
            <Trash2 size={16} /> Eliminar todos los datos de demostración
          </h3>
          <p className="text-sm text-neutral-400 mb-4">
            Esta acción eliminará permanentemente los <strong className="text-red-400">{data?.total ?? 0} registros</strong> marcados como demo.
            No se pueden recuperar.
          </p>

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-700/50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Purgar datos de demostración…
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-300">
                Escribe <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-red-300">PURGE_DEMO</code> para confirmar:
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="PURGE_DEMO"
                  className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm font-mono w-52 focus:outline-none focus:border-red-500"
                />
                <button
                  onClick={() => purgeMutation.mutate()}
                  disabled={confirmText !== 'PURGE_DEMO' || purgeMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {purgeMutation.isPending ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Confirmar purga
                </button>
                <button
                  onClick={() => { setShowConfirm(false); setConfirmText(''); }}
                  className="text-neutral-400 hover:text-white text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
