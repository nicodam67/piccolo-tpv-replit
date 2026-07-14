import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, LayoutDashboard, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetZones,
  useCreateZone,
  useUpdateZone,
  useDeleteZone,
  getGetZonesQueryKey,
} from '@workspace/api-client-react';

export default function Configuracion() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Admin guard
  useEffect(() => {
    const empStr = localStorage.getItem('employee');
    if (!empStr) { setLocation('/'); return; }
    try {
      const emp = JSON.parse(empStr);
      if (emp.role !== 'admin') setLocation('/tables');
    } catch { setLocation('/'); }
  }, [setLocation]);

  const { data: zones, isLoading } = useGetZones({ query: { queryKey: getGetZonesQueryKey() } });

  const createZone  = useCreateZone();
  const updateZone  = useUpdateZone();
  const deleteZone  = useDeleteZone();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newZoneName, setNewZoneName]           = useState('');
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [editingName, setEditingName]           = useState('');
  const [deletingId, setDeletingId]             = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetZonesQueryKey() });

  const handleCreate = () => {
    if (!newZoneName.trim()) return;
    createZone.mutate(
      { data: { name: newZoneName.trim(), type: 'dining' } },
      {
        onSuccess: () => { invalidate(); setShowCreateDialog(false); setNewZoneName(''); toast.success('Sala creada'); },
        onError: () => toast.error('Error al crear sala'),
      }
    );
  };

  const handleRename = (zoneId: string) => {
    if (!editingName.trim()) return;
    updateZone.mutate(
      { zoneId, data: { name: editingName.trim() } },
      {
        onSuccess: () => { invalidate(); setEditingId(null); toast.success('Sala renombrada'); },
        onError: () => toast.error('Error al renombrar sala'),
      }
    );
  };

  const handleDelete = (zoneId: string) => {
    deleteZone.mutate(
      { zoneId },
      {
        onSuccess: () => { invalidate(); setDeletingId(null); toast.success('Sala eliminada'); },
        onError: () => toast.error('Error al eliminar sala'),
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-16 flex items-center px-4 lg:px-6 border-b border-border bg-card shrink-0 shadow-sm">
        <button
          onClick={() => setLocation('/tables')}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold ml-3">Configuración · Salas</h1>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md text-sm"
        >
          <Plus size={16} /> Nueva Sala
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 lg:p-10 max-w-4xl mx-auto w-full">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : !zones?.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <LayoutDashboard size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-semibold">No hay salas configuradas</p>
            <p className="text-sm mt-1">Crea la primera sala para empezar a distribuir mesas</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map(zone => (
              <div
                key={zone.id}
                className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4"
              >
                {/* Name row */}
                {editingId === zone.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(zone.id); if (e.key === 'Escape') setEditingId(null); }}
                      className="flex-1 bg-background border border-primary rounded-lg px-3 py-1.5 text-base font-bold focus:outline-none"
                    />
                    <button onClick={() => handleRename(zone.id)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary active:scale-95">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black leading-tight">{zone.name}</h2>
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{zone.type}</span>
                    </div>
                    <button
                      onClick={() => { setEditingId(zone.id); setEditingName(zone.name); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => setLocation(`/configuracion/salas/${zone.id}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary/10 text-primary border border-primary/30 rounded-xl font-bold text-sm hover:bg-primary hover:text-primary-foreground transition-all active:scale-95"
                  >
                    <LayoutDashboard size={14} /> Editar plano
                  </button>
                  <button
                    onClick={() => setDeletingId(zone.id)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all active:scale-95 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-black mb-4">Nueva Sala</h3>
            <input
              autoFocus
              placeholder="Ej. Terraza, Privado, Barra…"
              value={newZoneName}
              onChange={e => setNewZoneName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateDialog(false); }}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:border-primary transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowCreateDialog(false); setNewZoneName(''); }}
                className="flex-1 py-3 bg-secondary text-foreground font-bold rounded-xl active:scale-95">Cancelar</button>
              <button onClick={handleCreate} disabled={createZone.isPending || !newZoneName.trim()}
                className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {createZone.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-black mb-2">¿Eliminar sala?</h3>
            <p className="text-muted-foreground text-sm mb-6">Se eliminarán también todas las mesas de esta sala. Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-3 bg-secondary font-bold rounded-xl active:scale-95">Cancelar</button>
              <button onClick={() => handleDelete(deletingId)} disabled={deleteZone.isPending}
                className="flex-1 py-3 bg-destructive text-destructive-foreground font-bold rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleteZone.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
