import { useState, useEffect } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { fetchQrCategories, fetchQrProducts, patchCategory, patchProduct } from './lib';
import type { QrCategory, QrProduct } from './lib';

// ── SortableProductRow ─────────────────────────────────────────────────────────

function SortableProductRow({
  product,
  accentColor,
  onToggleVisible,
}: {
  product: QrProduct;
  accentColor: string;
  onToggleVisible: (id: string, visible: boolean) => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: product.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-lg text-sm group ml-8"
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none">
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`truncate font-medium ${product.qrVisible === false ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {product.name}
        </p>
        <p className="text-xs text-gray-400">€{Number(product.price).toFixed(2)}</p>
      </div>
      <button
        type="button"
        title={product.qrVisible === false ? 'Mostrar en carta' : 'Ocultar de carta'}
        onClick={() => onToggleVisible(product.id, product.qrVisible !== false)}
        className="p-1 rounded cursor-pointer transition-colors hover:bg-gray-100"
      >
        {product.qrVisible === false
          ? <EyeOff size={14} className="text-gray-300" />
          : <Eye size={14} style={{ color: accentColor }} />
        }
      </button>
    </div>
  );
}

// ── SortableCategoryRow ────────────────────────────────────────────────────────

function SortableCategoryRow({
  category,
  products,
  accentColor,
  onToggleCategory,
  onToggleProduct,
  onReorderProducts,
}: {
  category: QrCategory;
  products: QrProduct[];
  accentColor: string;
  onToggleCategory: (id: string, visible: boolean) => void;
  onToggleProduct: (id: string, visible: boolean) => void;
  onReorderProducts: (categoryId: string, newProducts: QrProduct[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = products.findIndex((p) => p.id === active.id);
      const newIndex = products.findIndex((p) => p.id === over.id);
      onReorderProducts(category.id, arrayMove(products, oldIndex, newIndex));
    }
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 group">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none">
          <GripVertical size={16} />
        </button>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex-1 flex items-center gap-2 text-left cursor-pointer">
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <span className={`font-semibold text-sm ${!category.active ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {category.icon && <span className="mr-1">{category.icon}</span>}
            {category.name}
          </span>
          <span className="text-xs text-gray-400">({products.length} platos)</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleCategory(category.id, category.active)}
          className="p-1 rounded cursor-pointer hover:bg-gray-200 transition-colors"
          title={category.active ? 'Ocultar categoría' : 'Mostrar categoría'}
        >
          {category.active
            ? <Eye size={15} style={{ color: accentColor }} />
            : <EyeOff size={15} className="text-gray-300" />
          }
        </button>
      </div>
      {expanded && products.length > 0 && (
        <div className="mt-1 space-y-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {products.map((p) => (
                <SortableProductRow key={p.id} product={p} accentColor={accentColor} onToggleVisible={onToggleProduct} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function TabMenuTree({ accentColor }: { accentColor?: string }) {
  const accent = accentColor ?? '#c8963e';
  const [categories, setCategories] = useState<QrCategory[]>([]);
  const [products, setProducts] = useState<QrProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    Promise.all([fetchQrCategories(), fetchQrProducts()])
      .then(([cats, prods]) => {
        setCategories(cats.sort((a, b) => a.sortOrder - b.sortOrder));
        setProducts(prods.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function toggleCategory(id: string, currentActive: boolean) {
    setSaving(id);
    setCategories((prev) => prev.map((c) => c.id === id ? { ...c, active: !currentActive } : c));
    try { await patchCategory(id, { active: !currentActive }); } catch { /* revert */ setCategories((prev) => prev.map((c) => c.id === id ? { ...c, active: currentActive } : c)); }
    setSaving(null);
  }

  async function toggleProduct(id: string, currentVisible: boolean) {
    setSaving(id);
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, qrVisible: !currentVisible } : p));
    try { await patchProduct(id, { qrVisible: !currentVisible }); } catch { setProducts((prev) => prev.map((p) => p.id === id ? { ...p, qrVisible: currentVisible } : p)); }
    setSaving(null);
  }

  function handleReorderProducts(categoryId: string, newProducts: QrProduct[]) {
    setProducts((prev) => {
      const others = prev.filter((p) => p.categoryId !== categoryId);
      const updated = newProducts.map((p, i) => ({ ...p, sortOrder: i }));
      // persist in background
      updated.forEach((p) => patchProduct(p.id, { sortOrder: p.sortOrder }).catch(() => {}));
      return [...others, ...updated];
    });
  }

  function handleReorderCategories(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCategories((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      reordered.forEach((c, i) => patchCategory(c.id, { sortOrder: i }).catch(() => {}));
      return reordered;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando menú…
      </div>
    );
  }
  if (error) {
    return <div className="text-red-500 text-sm py-8 text-center">{error}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">
          Arrastra para reordenar. Usa el ojo para mostrar/ocultar en la carta pública.
        </p>
        {saving && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Guardando…</span>}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorderCategories}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {categories.map((cat) => (
            <SortableCategoryRow
              key={cat.id}
              category={cat}
              products={products.filter((p) => p.categoryId === cat.id)}
              accentColor={accent}
              onToggleCategory={toggleCategory}
              onToggleProduct={toggleProduct}
              onReorderProducts={handleReorderProducts}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
