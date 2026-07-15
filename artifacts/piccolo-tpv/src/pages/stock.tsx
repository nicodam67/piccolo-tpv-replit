import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  ArrowLeft,
  AlertTriangle,
  Boxes,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Plus,
  X,
} from 'lucide-react';
import {
  useGetStockAlerts,
  useGetStockMovements,
  useGetAdminIngredients,
  useCreateStockMovement,
  getGetAdminIngredientsQueryKey,
  getGetStockAlertsQueryKey,
} from '@workspace/api-client-react';
import type { Ingredient } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

type MovType = 'purchase' | 'sale' | 'adjustment' | 'waste' | 'inventory';

const MOV_LABELS: Record<MovType, { label: string; color: string; icon: React.ReactNode }> = {
  purchase:   { label: 'Compra', color: '#3caa78', icon: <TrendingUp size={12} /> },
  sale:       { label: 'Venta', color: '#6082dc', icon: <TrendingDown size={12} /> },
  adjustment: { label: 'Ajuste', color: '#d2a032', icon: <RefreshCw size={12} /> },
  waste:      { label: 'Merma', color: '#dc3c3c', icon: <TrendingDown size={12} /> },
  inventory:  { label: 'Inventario', color: '#9060dc', icon: <RefreshCw size={12} /> },
};

export default function StockPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'alerts' | 'movements'>('alerts');
  const [filterType, setFilterType] = useState<string>('');
  const [filterIngredient, setFilterIngredient] = useState<string>('');
  const [showNewMovSheet, setShowNewMovSheet] = useState(false);

  const { data: alerts = [], isLoading: alertsLoading } = useGetStockAlerts();
  const movParams = { movementType: filterType || undefined, ingredientId: filterIngredient || undefined };
  const { data: movements = [], isLoading: movLoading } = useGetStockMovements(movParams);
  const { data: ingredients = [] } = useGetAdminIngredients();
  const createMov = useCreateStockMovement();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetAdminIngredientsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetStockAlertsQueryKey() });
    qc.invalidateQueries({ queryKey: ['/api/admin/stock/movements'] });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 gap-3 bg-card border-b border-border">
        <button onClick={() => setLocation('/admin')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <Boxes size={18} className="text-amber-600" />
        <div className="flex-1">
          <p className="font-black text-sm leading-tight">Stock</p>
          <p className="text-[11px] text-muted-foreground">Inventario · movimientos · alertas</p>
        </div>
        <button
          onClick={() => setShowNewMovSheet(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-sm font-bold hover:bg-secondary/80 transition-colors border border-border"
        >
          <Plus size={14} />
          Movimiento
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-4 pb-2">
        {[
          { id: 'alerts', label: `Alertas${alerts.length > 0 ? ` (${alerts.length})` : ''}` },
          { id: 'movements', label: 'Movimientos' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 pb-6">
        {tab === 'alerts' && (
          <AlertsPanel alerts={alerts} isLoading={alertsLoading} />
        )}
        {tab === 'movements' && (
          <MovementsPanel
            movements={movements}
            ingredients={ingredients}
            isLoading={movLoading}
            filterType={filterType}
            filterIngredient={filterIngredient}
            onFilterType={setFilterType}
            onFilterIngredient={setFilterIngredient}
          />
        )}
      </div>

      {/* New movement sheet */}
      {showNewMovSheet && (
        <NewMovementSheet
          ingredients={ingredients}
          onClose={() => setShowNewMovSheet(false)}
          onSave={async data => {
            await createMov.mutateAsync({ data });
            invalidate();
            toast.success('Movimiento registrado');
            setShowNewMovSheet(false);
          }}
          saving={createMov.isPending}
        />
      )}
    </div>
  );
}

// ─── Alerts panel ─────────────────────────────────────────────────────────────
function AlertsPanel({ alerts, isLoading }: { alerts: Ingredient[]; isLoading: boolean }) {
  if (isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Cargando…</div>;
  if (alerts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <Boxes size={36} strokeWidth={1.2} className="text-green-500/50" />
      <p className="text-sm font-semibold text-green-500">Todo el stock está por encima del mínimo</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="flex items-center gap-2 px-1 mb-1">
        <AlertTriangle size={14} className="text-orange-400" />
        <p className="text-sm font-bold text-orange-400">{alerts.length} {alerts.length === 1 ? 'ingrediente' : 'ingredientes'} bajo mínimo</p>
      </div>
      {alerts.map(ing => {
        const cur = parseFloat(ing.currentStock);
        const min = parseFloat(ing.minStock);
        const pct = min > 0 ? Math.min((cur / min) * 100, 100) : 0;
        const isZero = cur <= 0;
        return (
          <div key={ing.id} className={`rounded-xl border p-4 flex flex-col gap-2 ${isZero ? 'border-red-500/30 bg-red-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm">{ing.name}</p>
                {ing.supplierName && <p className="text-[11px] text-muted-foreground">{ing.supplierName}</p>}
              </div>
              <div className="text-right">
                <p className={`text-lg font-black ${isZero ? 'text-red-400' : 'text-orange-400'}`}>
                  {cur.toFixed(2)} <span className="text-sm font-semibold">{ing.unit}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">mín {min.toFixed(2)} {ing.unit}</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full ${isZero ? 'bg-red-500' : 'bg-orange-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Movements panel ──────────────────────────────────────────────────────────
function MovementsPanel({
  movements, ingredients, isLoading, filterType, filterIngredient, onFilterType, onFilterIngredient,
}: {
  movements: any[];
  ingredients: Ingredient[];
  isLoading: boolean;
  filterType: string;
  filterIngredient: string;
  onFilterType: (v: string) => void;
  onFilterIngredient: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs font-semibold focus:outline-none"
          value={filterType}
          onChange={e => onFilterType(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          <option value="purchase">Compra</option>
          <option value="sale">Venta</option>
          <option value="adjustment">Ajuste</option>
          <option value="waste">Merma</option>
          <option value="inventory">Inventario</option>
        </select>
        <select
          className="flex-1 px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs font-semibold focus:outline-none"
          value={filterIngredient}
          onChange={e => onFilterIngredient(e.target.value)}
        >
          <option value="">Todos los ingredientes</option>
          {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Cargando…</div>
      ) : movements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Boxes size={36} strokeWidth={1.2} />
          <p className="text-sm">No hay movimientos todavía</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {movements.map(m => {
            const t = m.movementType as MovType;
            const meta = MOV_LABELS[t] ?? { label: t, color: '#888', icon: null };
            const qty = parseFloat(m.quantity);
            const isOut = qty < 0;
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs" style={{ background: `${meta.color}20`, color: meta.color }}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{m.ingredientName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{m.reason || meta.label}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-black ${isOut ? 'text-red-400' : 'text-green-400'}`}>
                    {isOut ? '' : '+'}{qty.toFixed(3)} {m.ingredientUnit}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── New movement sheet ───────────────────────────────────────────────────────
function NewMovementSheet({
  ingredients, onClose, onSave, saving,
}: {
  ingredients: Ingredient[];
  onClose: () => void;
  onSave: (data: { ingredientId: string; movementType: 'purchase' | 'adjustment' | 'waste'; quantity: string; unitCost?: string; reason?: string }) => Promise<void>;
  saving: boolean;
}) {
  const [ingredientId, setIngredientId] = useState('');
  const [movementType, setMovementType] = useState<'purchase' | 'adjustment' | 'waste'>('adjustment');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');

  const selectedIng = ingredients.find(i => i.id === ingredientId);
  const isNegative = movementType === 'waste' || (movementType === 'adjustment' && parseFloat(quantity) < 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-t-3xl md:rounded-2xl p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-black text-base">Nuevo movimiento manual</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Ingrediente *</label>
            <select className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none" value={ingredientId} onChange={e => setIngredientId(e.target.value)}>
              <option value="">Selecciona un ingrediente…</option>
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Tipo</label>
            <div className="flex gap-2">
              {(['purchase', 'adjustment', 'waste'] as const).map(t => (
                <button key={t} onClick={() => setMovementType(t)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${movementType === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'}`}>
                  {MOV_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">
              Cantidad {selectedIng ? `(${selectedIng.unit})` : ''}
              {movementType === 'adjustment' && <span className="text-muted-foreground font-normal ml-1">· negativo para reducir</span>}
              {movementType === 'waste' && <span className="text-muted-foreground font-normal ml-1">· se restará del stock</span>}
            </label>
            <input type="number" step="0.01"
              className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
              value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0.00" />
          </div>
          {movementType === 'purchase' && (
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Coste unitario</label>
              <input type="number" step="0.0001" min="0"
                className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
                value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1 block">Motivo</label>
            <input className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
              value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. merma por caducidad" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancelar</button>
          <button
            onClick={() => {
              if (!ingredientId) { toast.error('Selecciona un ingrediente'); return; }
              if (!quantity) { toast.error('Introduce una cantidad'); return; }
              const qty = movementType === 'waste' ? String(-Math.abs(parseFloat(quantity))) : quantity;
              onSave({ ingredientId, movementType, quantity: qty, unitCost: unitCost || undefined, reason: reason || undefined });
            }}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
