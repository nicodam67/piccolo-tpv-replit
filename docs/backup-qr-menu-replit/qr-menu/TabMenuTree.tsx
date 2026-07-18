/**
 * TabMenuTree — Árbol del menú con DnD completo + CRUD
 * Fiel al MenuTree.tsx del programa original (Convex + React)
 * adaptado al backend Express + PostgreSQL de Piccolo.
 */
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
import {
  GripVertical, Eye, EyeOff, ChevronDown, ChevronRight, Loader2,
  Plus, Pencil, Trash2, X, ImageIcon, Languages, Check,
} from 'lucide-react';
import {
  fetchQrCategories, fetchQrProducts, patchCategory, patchProduct,
  createCategory, deleteCategory, createProduct,
  type QrCategory, type QrProduct,
} from './lib';
import { EU_ALLERGENS } from '../../lib/allergens';

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCALES = ['es', 'en', 'fr', 'de', 'ca', 'it', 'nl', 'ro'] as const;
type Locale = typeof LOCALES[number];
const LOCALE_LABELS: Record<Locale, string> = {
  es: '🇪🇸 Español', en: '🇬🇧 English', fr: '🇫🇷 Français', de: '🇩🇪 Deutsch',
  ca: '🏴 Català', it: '🇮🇹 Italiano', nl: '🇳🇱 Nederlands', ro: '🇷🇴 Română',
};

const DIETARY_LIST = [
  { id: 'isVegetariano', label: '🥦 Vegetariano' },
  { id: 'isVegano', label: '🌿 Vegano' },
  { id: 'isSinGluten', label: '🚫🌾 Sin gluten' },
  { id: 'isPicante', label: '🌶️ Picante' },
] as const;

type ProductDietKey = typeof DIETARY_LIST[number]['id'];

// ── Form types ─────────────────────────────────────────────────────────────────

type CatForm = {
  name: string;
  description: string;
  icon: string;
  color: string;
  order: string;
  translations: Record<string, { name: string; description: string }>;
};

const emptyCatForm = (): CatForm => ({
  name: '', description: '', icon: '', color: '', order: '',
  translations: Object.fromEntries(LOCALES.filter(l => l !== 'es').map(l => [l, { name: '', description: '' }])),
});

type ProductForm = {
  name: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  price: string;
  halfPortionEnabled: boolean;
  halfPortionPrice: string;
  quantity: string;
  qrVisible: boolean;
  isVegetariano: boolean;
  isVegano: boolean;
  isSinGluten: boolean;
  isPicante: boolean;
  allergens: string[];
  translations: Record<string, { name: string; description: string }>;
};

const emptyProductForm = (): ProductForm => ({
  name: '', description: '', imageUrl: '', videoUrl: '',
  price: '', halfPortionEnabled: false, halfPortionPrice: '', quantity: '',
  qrVisible: true,
  isVegetariano: false, isVegano: false, isSinGluten: false, isPicante: false,
  allergens: [],
  translations: Object.fromEntries(LOCALES.filter(l => l !== 'es').map(l => [l, { name: '', description: '' }])),
});

function allergenStringToArray(s?: string): string[] {
  if (!s) return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function productToForm(p: QrProduct): ProductForm {
  const tr = p.translations ?? {};
  return {
    name: p.name,
    description: p.description ?? '',
    imageUrl: p.imageUrl ?? '',
    videoUrl: p.videoUrl ?? '',
    price: p.price,
    halfPortionEnabled: !!p.halfPortionPrice,
    halfPortionPrice: p.halfPortionPrice ?? '',
    quantity: p.quantity ?? '',
    qrVisible: p.qrVisible !== false,
    isVegetariano: p.isVegetariano ?? false,
    isVegano: p.isVegano ?? false,
    isSinGluten: p.isSinGluten ?? false,
    isPicante: p.isPicante ?? false,
    allergens: allergenStringToArray(p.allergens),
    translations: Object.fromEntries(
      LOCALES.filter(l => l !== 'es').map(l => [l, {
        name: tr[l]?.name ?? '',
        description: tr[l]?.description ?? '',
      }])
    ),
  };
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function TabBar({ tabs, active, onSelect }: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
      {tabs.map(({ id, label }) => (
        <button
          key={id} type="button" onClick={() => onSelect(id)}
          className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
            active === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, required }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type} value={value} disabled={disabled}
      placeholder={placeholder ?? ''} onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:bg-gray-50"
    />
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value} placeholder={placeholder ?? ''} rows={2}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
    />
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel, loading }: {
  message: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <p className="text-sm text-gray-700">{message}</p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 cursor-pointer hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 cursor-pointer">
            {loading ? <Loader2 size={14} className="animate-spin inline-block" /> : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category dialog ──────────────────────────────────────────────────────────

function CategoryDialog({
  mode, initial, categories, onSave, onClose,
}: {
  mode: 'create' | 'edit';
  initial: CatForm;
  categories: QrCategory[];
  onSave: (form: CatForm) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CatForm>(initial);
  const [locale, setLocale] = useState<Locale>('es');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pf(p: Partial<CatForm>) { setForm(f => ({ ...f, ...p })); }
  function setTr(loc: string, field: 'name' | 'description', val: string) {
    setForm(f => ({ ...f, translations: { ...f.translations, [loc]: { ...(f.translations[loc] ?? { name: '', description: '' }), [field]: val } } }));
  }

  async function submit() {
    if (!form.name.trim()) { setErr('El nombre es obligatorio'); return; }
    setSaving(true); setErr(null);
    try { await onSave(form); onClose(); } catch (e) { setErr(String(e)); setSaving(false); }
  }

  const localeTabs = LOCALES.map(l => ({ id: l, label: LOCALE_LABELS[l].split(' ')[0] + ' ' + l.toUpperCase() }));

  return (
    <Modal
      title={mode === 'create' ? 'Nueva categoría' : 'Editar categoría'}
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 cursor-pointer hover:bg-gray-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </>}
    >
      {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs p-3">{err}</div>}

      {/* Locale tabs */}
      <TabBar tabs={localeTabs} active={locale} onSelect={(id) => setLocale(id as Locale)} />

      {/* Spanish (base) */}
      {locale === 'es' && (
        <div className="space-y-3">
          <Field label="Nombre" required><Input value={form.name} onChange={(v) => pf({ name: v })} placeholder="ej. Entrantes" /></Field>
          <Field label="Descripción"><Textarea value={form.description} onChange={(v) => pf({ description: v })} placeholder="Descripción breve de la categoría" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Emoji / Icono"><Input value={form.icon} onChange={(v) => pf({ icon: v })} placeholder="🍕" /></Field>
            <Field label="Orden de visualización"><Input value={form.order} onChange={(v) => pf({ order: v })} placeholder="1" type="number" /></Field>
          </div>
        </div>
      )}

      {/* Other locales */}
      {locale !== 'es' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Deja en blanco para usar el español.</p>
          <Field label={`Nombre en ${LOCALE_LABELS[locale]}`}>
            <Input value={form.translations[locale]?.name ?? ''} onChange={(v) => setTr(locale, 'name', v)} placeholder={form.name} />
          </Field>
          <Field label="Descripción">
            <Textarea value={form.translations[locale]?.description ?? ''} onChange={(v) => setTr(locale, 'description', v)} placeholder={form.description} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ── Product dialog ───────────────────────────────────────────────────────────

type ProductDialogTab = 'general' | 'precio' | 'tags' | 'traducciones';

function ProductDialog({
  product,
  categories,
  onSave,
  onClose,
}: {
  product: QrProduct | null; // null = create mode
  categories: QrCategory[];
  onSave: (form: ProductForm, catId: string) => Promise<void>;
  onClose: () => void;
}) {
  const isCreate = !product;
  const [form, setForm] = useState<ProductForm>(() => product ? productToForm(product) : emptyProductForm());
  const [tab, setTab] = useState<ProductDialogTab>('general');
  const [locale, setLocale] = useState<Locale>('en');
  const [catId, setCatId] = useState<string>(product?.categoryId ?? categories[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pf(p: Partial<ProductForm>) { setForm(f => ({ ...f, ...p })); }
  function setTr(loc: string, field: 'name' | 'description', val: string) {
    setForm(f => ({ ...f, translations: { ...f.translations, [loc]: { ...(f.translations[loc] ?? { name: '', description: '' }), [field]: val } } }));
  }
  function toggleAllergen(id: string) {
    setForm(f => ({
      ...f,
      allergens: f.allergens.includes(id) ? f.allergens.filter(a => a !== id) : [...f.allergens, id],
    }));
  }
  function toggleDiet(key: ProductDietKey) {
    setForm(f => ({ ...f, [key]: !f[key] }));
  }

  async function submit() {
    if (!form.name.trim()) { setErr('El nombre es obligatorio'); setTab('general'); return; }
    if (!form.price) { setErr('El precio es obligatorio'); setTab('precio'); return; }
    setSaving(true); setErr(null);
    try { await onSave(form, catId); onClose(); } catch (e) { setErr(String(e)); setSaving(false); }
  }

  const TABS: { id: ProductDialogTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'precio', label: 'Precio' },
    { id: 'tags', label: 'Tags & Alérgenos' },
    { id: 'traducciones', label: 'Traducciones' },
  ];

  const transLocaleTabs = LOCALES.filter(l => l !== 'es').map(l => ({
    id: l, label: LOCALE_LABELS[l].split(' ')[0] + ' ' + l.toUpperCase(),
  }));

  return (
    <Modal
      title={isCreate ? 'Nuevo plato' : `Editar: ${product?.name}`}
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 cursor-pointer hover:bg-gray-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </>}
    >
      {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs p-3">{err}</div>}
      <TabBar tabs={TABS} active={tab} onSelect={(id) => setTab(id as ProductDialogTab)} />

      {/* Tab: General */}
      {tab === 'general' && (
        <div className="space-y-3">
          {isCreate && (
            <Field label="Categoría" required>
              <select
                value={catId} onChange={(e) => setCatId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Nombre" required><Input value={form.name} onChange={(v) => pf({ name: v })} placeholder="ej. Carpaccio de ternera" /></Field>
          <Field label="Descripción"><Textarea value={form.description} onChange={(v) => pf({ description: v })} placeholder="Descripción breve del plato" /></Field>
          <Field label="URL de imagen"><Input value={form.imageUrl} onChange={(v) => pf({ imageUrl: v })} placeholder="https://…" type="url" /></Field>
          <Field label="URL de vídeo"><Input value={form.videoUrl} onChange={(v) => pf({ videoUrl: v })} placeholder="https://… (MP4)" type="url" /></Field>
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox" checked={form.qrVisible}
                onChange={(e) => pf({ qrVisible: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Visible en la carta pública</span>
            </label>
          </div>
          {form.imageUrl && (
            <div className="h-28 rounded-xl overflow-hidden bg-gray-100">
              <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      )}

      {/* Tab: Precio */}
      {tab === 'precio' && (
        <div className="space-y-3">
          <Field label="Precio (€)" required><Input value={form.price} onChange={(v) => pf({ price: v })} placeholder="12.50" type="number" /></Field>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox" checked={form.halfPortionEnabled}
              onChange={(e) => pf({ halfPortionEnabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Ofrecer precio de media ración</span>
          </label>
          {form.halfPortionEnabled && (
            <Field label="Precio media ración (€)">
              <Input value={form.halfPortionPrice} onChange={(v) => pf({ halfPortionPrice: v })} placeholder="7.50" type="number" />
            </Field>
          )}
          <Field label="Cantidad / Volumen">
            <Input value={form.quantity} onChange={(v) => pf({ quantity: v })} placeholder="ej. 250g, 500ml, 2 unidades" />
          </Field>
        </div>
      )}

      {/* Tab: Tags & Alérgenos */}
      {tab === 'tags' && (
        <div className="space-y-4">
          {/* Dietary */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Etiquetas dietéticas</p>
            <div className="grid grid-cols-2 gap-2">
              {DIETARY_LIST.map(({ id, label }) => (
                <label key={id} className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                  <input
                    type="checkbox" checked={form[id as ProductDietKey]}
                    onChange={() => toggleDiet(id as ProductDietKey)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Allergens */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Alérgenos (14 EU)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {EU_ALLERGENS.map((a) => (
                <label key={a.id} className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                  <input
                    type="checkbox" checked={form.allergens.includes(a.id)}
                    onChange={() => toggleAllergen(a.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{a.icon} {a.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Traducciones */}
      {tab === 'traducciones' && (
        <div className="space-y-3">
          <TabBar tabs={transLocaleTabs} active={locale} onSelect={(id) => setLocale(id as Locale)} />
          <p className="text-xs text-gray-400">Deja en blanco para usar el nombre/descripción en español.</p>
          <Field label={`Nombre en ${LOCALE_LABELS[locale]}`}>
            <Input value={form.translations[locale]?.name ?? ''} onChange={(v) => setTr(locale, 'name', v)} placeholder={form.name} />
          </Field>
          <Field label="Descripción">
            <Textarea value={form.translations[locale]?.description ?? ''} onChange={(v) => setTr(locale, 'description', v)} placeholder={form.description} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ── Sortable product row ──────────────────────────────────────────────────────

function SortableProductRow({
  product, accentColor,
  onToggleVisible, onEdit, onDelete,
}: {
  product: QrProduct; accentColor: string;
  onToggleVisible: (id: string, visible: boolean) => void;
  onEdit: (p: QrProduct) => void;
  onDelete: (p: QrProduct) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-lg text-sm group ml-8 hover:border-gray-200 transition-colors"
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none shrink-0">
        <GripVertical size={14} />
      </button>
      {/* Thumbnail */}
      <div className="w-8 h-8 rounded-md bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          : <ImageIcon size={12} className="text-gray-300" />
        }
      </div>
      {/* Name + price */}
      <div className="flex-1 min-w-0">
        <p className={`truncate font-medium text-sm ${product.qrVisible === false ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {product.name}
        </p>
        <p className="text-xs text-gray-400">
          €{Number(product.price).toFixed(2)}
          {product.halfPortionPrice && ` · ½ €${Number(product.halfPortionPrice).toFixed(2)}`}
        </p>
      </div>
      {/* Eye toggle */}
      <button
        type="button" title={product.qrVisible === false ? 'Mostrar en carta' : 'Ocultar de carta'}
        onClick={() => onToggleVisible(product.id, product.qrVisible !== false)}
        className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-gray-100 shrink-0"
      >
        {product.qrVisible === false
          ? <EyeOff size={13} className="text-gray-300" />
          : <Eye size={13} style={{ color: accentColor }} />}
      </button>
      {/* Edit */}
      <button type="button" onClick={() => onEdit(product)} className="p-1.5 rounded-md cursor-pointer hover:bg-gray-100 shrink-0">
        <Pencil size={13} className="text-gray-400" />
      </button>
      {/* Delete */}
      <button type="button" onClick={() => onDelete(product)} className="p-1.5 rounded-md cursor-pointer hover:bg-red-50 shrink-0">
        <Trash2 size={13} className="text-red-400" />
      </button>
    </div>
  );
}

// ── Sortable category row ─────────────────────────────────────────────────────

function SortableCategoryRow({
  category, products, accentColor,
  onToggleCategory, onToggleProduct, onReorderProducts,
  onEditCat, onDeleteCat, onAddProduct, onEditProduct, onDeleteProduct,
}: {
  category: QrCategory; products: QrProduct[]; accentColor: string;
  onToggleCategory: (id: string, active: boolean) => void;
  onToggleProduct: (id: string, visible: boolean) => void;
  onReorderProducts: (catId: string, newProducts: QrProduct[]) => void;
  onEditCat: (c: QrCategory) => void;
  onDeleteCat: (c: QrCategory) => void;
  onAddProduct: (catId: string) => void;
  onEditProduct: (p: QrProduct) => void;
  onDeleteProduct: (p: QrProduct) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const innerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleProductDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = products.findIndex(p => p.id === active.id);
      const newIdx = products.findIndex(p => p.id === over.id);
      onReorderProducts(category.id, arrayMove(products, oldIdx, newIdx));
    }
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100/70 transition-colors">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none shrink-0">
          <GripVertical size={16} />
        </button>
        {/* Expand toggle */}
        <button type="button" onClick={() => setExpanded(v => !v)} className="flex-1 flex items-center gap-2 text-left cursor-pointer min-w-0">
          {expanded ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
          <span className={`font-semibold text-sm truncate ${!category.active ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {category.icon && <span className="mr-1">{category.icon}</span>}
            {category.name}
          </span>
          <span className="text-xs text-gray-400 shrink-0">({products.length})</span>
        </button>
        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button" title="Añadir plato" onClick={() => { setExpanded(true); onAddProduct(category.id); }}
            className="p-1.5 rounded-md cursor-pointer hover:bg-gray-200 transition-colors"
          >
            <Plus size={14} className="text-gray-500" />
          </button>
          <button
            type="button" title={category.active ? 'Ocultar categoría' : 'Mostrar categoría'}
            onClick={() => onToggleCategory(category.id, category.active)}
            className="p-1.5 rounded-md cursor-pointer hover:bg-gray-200 transition-colors"
          >
            {category.active
              ? <Eye size={14} style={{ color: accentColor }} />
              : <EyeOff size={14} className="text-gray-300" />}
          </button>
          <button type="button" onClick={() => onEditCat(category)} className="p-1.5 rounded-md cursor-pointer hover:bg-gray-200 transition-colors">
            <Pencil size={14} className="text-gray-500" />
          </button>
          <button type="button" onClick={() => onDeleteCat(category)} className="p-1.5 rounded-md cursor-pointer hover:bg-red-50 transition-colors">
            <Trash2 size={14} className="text-red-400" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-1 space-y-1">
          {products.length === 0 && (
            <div className="ml-8 px-3 py-3 text-xs text-gray-400 italic text-center">
              Sin platos. Usa + para añadir.
            </div>
          )}
          {products.length > 0 && (
            <DndContext sensors={innerSensors} collisionDetection={closestCenter} onDragEnd={handleProductDragEnd}>
              <SortableContext items={products.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {products.map(p => (
                  <SortableProductRow
                    key={p.id} product={p} accentColor={accentColor}
                    onToggleVisible={onToggleProduct}
                    onEdit={onEditProduct}
                    onDelete={onDeleteProduct}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TabMenuTree({ accentColor }: { accentColor?: string }) {
  const accent = accentColor ?? '#c8963e';

  const [categories, setCategories] = useState<QrCategory[]>([]);
  const [products, setProducts] = useState<QrProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Category dialog
  const [catDialogMode, setCatDialogMode] = useState<'create' | 'edit' | null>(null);
  const [catDialogData, setCatDialogData] = useState<QrCategory | null>(null);

  // Product dialog
  const [productDialogData, setProductDialogData] = useState<QrProduct | null>(null);
  const [productDialogCreate, setProductDialogCreate] = useState<string | null>(null); // catId for create mode

  // Confirm delete
  const [confirm, setConfirm] = useState<{ type: 'category' | 'product'; id: string; name: string } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const outerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    Promise.all([fetchQrCategories(), fetchQrProducts()])
      .then(([cats, prods]) => {
        setCategories(cats.sort((a, b) => a.sortOrder - b.sortOrder));
        setProducts(prods.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Toggle handlers ──────────────────────────────────────────────────────────

  async function toggleCategory(id: string, currentActive: boolean) {
    setSaving(id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, active: !currentActive } : c));
    try { await patchCategory(id, { active: !currentActive }); }
    catch { setCategories(prev => prev.map(c => c.id === id ? { ...c, active: currentActive } : c)); }
    setSaving(null);
  }

  async function toggleProduct(id: string, currentVisible: boolean) {
    setSaving(id);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, qrVisible: !currentVisible } : p));
    try { await patchProduct(id, { qrVisible: !currentVisible }); }
    catch { setProducts(prev => prev.map(p => p.id === id ? { ...p, qrVisible: currentVisible } : p)); }
    setSaving(null);
  }

  // ── Reorder handlers ─────────────────────────────────────────────────────────

  function handleReorderCategories(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCategories(prev => {
      const oldIdx = prev.findIndex(c => c.id === active.id);
      const newIdx = prev.findIndex(c => c.id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      reordered.forEach((c, i) => patchCategory(c.id, { sortOrder: i }).catch(() => {}));
      return reordered;
    });
  }

  function handleReorderProducts(catId: string, newProds: QrProduct[]) {
    setProducts(prev => {
      const others = prev.filter(p => p.categoryId !== catId);
      const updated = newProds.map((p, i) => ({ ...p, sortOrder: i }));
      updated.forEach(p => patchProduct(p.id, { sortOrder: p.sortOrder }).catch(() => {}));
      return [...others, ...updated];
    });
  }

  // ── Category CRUD ────────────────────────────────────────────────────────────

  function openCreateCat() {
    setCatDialogData(null);
    setCatDialogMode('create');
  }

  function openEditCat(cat: QrCategory) {
    setCatDialogData(cat);
    setCatDialogMode('edit');
  }

  async function saveCat(form: CatForm) {
    const translations: Record<string, { name?: string; description?: string }> = {};
    for (const [loc, tr] of Object.entries(form.translations)) {
      if (tr.name || tr.description) translations[loc] = { name: tr.name || undefined, description: tr.description || undefined };
    }
    if (catDialogMode === 'create') {
      const created = await createCategory({
        name: form.name.trim(),
        icon: form.icon || undefined,
        color: form.color || undefined,
        sortOrder: form.order ? parseInt(form.order) : categories.length,
        translations: Object.keys(translations).length ? translations : undefined,
      });
      setCategories(prev => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
    } else if (catDialogMode === 'edit' && catDialogData) {
      await patchCategory(catDialogData.id, {
        name: form.name.trim(),
        icon: form.icon || null,
        color: form.color || null,
        sortOrder: form.order ? parseInt(form.order) : catDialogData.sortOrder,
        translations,
      });
      setCategories(prev => prev.map(c => c.id === catDialogData.id
        ? { ...c, name: form.name.trim(), icon: form.icon || null, color: form.color || null, translations }
        : c
      ));
    }
  }

  function requestDeleteCat(cat: QrCategory) {
    setConfirm({ type: 'category', id: cat.id, name: cat.name });
  }

  async function confirmDelete() {
    if (!confirm) return;
    setConfirmLoading(true);
    try {
      if (confirm.type === 'category') {
        await deleteCategory(confirm.id);
        setCategories(prev => prev.filter(c => c.id !== confirm.id));
        setProducts(prev => prev.filter(p => p.categoryId !== confirm.id));
      } else {
        await patchProduct(confirm.id, { active: false });
        setProducts(prev => prev.filter(p => p.id !== confirm.id));
      }
      setConfirm(null);
    } catch (e) {
      setError(String(e));
      setConfirm(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  // ── Product CRUD ─────────────────────────────────────────────────────────────

  function openCreateProduct(catId: string) {
    setProductDialogCreate(catId);
    setProductDialogData(null);
  }

  function openEditProduct(p: QrProduct) {
    setProductDialogData(p);
    setProductDialogCreate(null);
  }

  function requestDeleteProduct(p: QrProduct) {
    setConfirm({ type: 'product', id: p.id, name: p.name });
  }

  async function saveProduct(form: ProductForm, catId: string) {
    const translations: Record<string, { name?: string; description?: string }> = {};
    for (const [loc, tr] of Object.entries(form.translations)) {
      if (tr.name || tr.description) translations[loc] = { name: tr.name || undefined, description: tr.description || undefined };
    }

    const patch = {
      name: form.name.trim(),
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      videoUrl: form.videoUrl || null,
      price: form.price,
      halfPortionPrice: form.halfPortionEnabled ? (form.halfPortionPrice || null) : null,
      quantity: form.quantity || null,
      qrVisible: form.qrVisible,
      isVegetariano: form.isVegetariano,
      isVegano: form.isVegano,
      isSinGluten: form.isSinGluten,
      isPicante: form.isPicante,
      allergens: form.allergens.join(','),
      translations,
    };

    if (productDialogData) {
      // Edit existing
      await patchProduct(productDialogData.id, patch);
      setProducts(prev => prev.map(p => p.id === productDialogData.id ? { ...p, ...patch, categoryId: p.categoryId } : p));
    } else {
      // Create new
      const created = await createProduct({
        categoryId: catId,
        name: patch.name,
        price: patch.price,
        description: form.description || undefined,
        allergens: patch.allergens || undefined,
        halfPortionPrice: patch.halfPortionPrice,
        quantity: form.quantity || undefined,
        imageUrl: form.imageUrl || undefined,
        isVegetariano: form.isVegetariano,
        isVegano: form.isVegano,
        isSinGluten: form.isSinGluten,
        isPicante: form.isPicante,
        sortOrder: products.filter(p => p.categoryId === catId).length,
      });
      // Apply remaining fields (translations, videoUrl, qrVisible) via patch
      await patchProduct(created.id, { videoUrl: patch.videoUrl, translations, qrVisible: form.qrVisible });
      setProducts(prev => [...prev, { ...created, ...patch, categoryId: catId }]);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando menú…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-red-500 text-sm py-8 text-center">
        {error}
        <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer text-red-400 hover:text-red-600">Cerrar</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Arrastra para reordenar. Usa ✏️ para editar y 👁️ para mostrar/ocultar.
        </p>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Guardando…</span>}
          <button
            type="button" onClick={openCreateCat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors"
            style={{ background: accent }}
          >
            <Plus size={14} />
            Nueva categoría
          </button>
        </div>
      </div>

      {/* Category list with DnD */}
      <DndContext sensors={outerSensors} collisionDetection={closestCenter} onDragEnd={handleReorderCategories}>
        <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {categories.length === 0 && (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                <p className="text-sm">No hay categorías. Crea la primera con el botón &quot;Nueva categoría&quot;.</p>
              </div>
            )}
            {categories.map(cat => (
              <SortableCategoryRow
                key={cat.id}
                category={cat}
                products={products.filter(p => p.categoryId === cat.id)}
                accentColor={accent}
                onToggleCategory={toggleCategory}
                onToggleProduct={toggleProduct}
                onReorderProducts={handleReorderProducts}
                onEditCat={openEditCat}
                onDeleteCat={requestDeleteCat}
                onAddProduct={openCreateProduct}
                onEditProduct={openEditProduct}
                onDeleteProduct={requestDeleteProduct}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Category dialog */}
      {catDialogMode && (
        <CategoryDialog
          mode={catDialogMode}
          initial={catDialogData
            ? {
                name: catDialogData.name,
                description: catDialogData.description ?? '',
                icon: catDialogData.icon ?? '',
                color: catDialogData.color ?? '',
                order: String(catDialogData.sortOrder),
                translations: Object.fromEntries(
                  LOCALES.filter(l => l !== 'es').map(l => [l, {
                    name: catDialogData.translations?.[l]?.name ?? '',
                    description: catDialogData.translations?.[l]?.description ?? '',
                  }])
                ),
              }
            : emptyCatForm()
          }
          categories={categories}
          onSave={saveCat}
          onClose={() => setCatDialogMode(null)}
        />
      )}

      {/* Product dialog (create or edit) */}
      {(productDialogData || productDialogCreate) && (
        <ProductDialog
          product={productDialogData}
          categories={categories}
          onSave={saveProduct}
          onClose={() => { setProductDialogData(null); setProductDialogCreate(null); }}
        />
      )}

      {/* Confirm delete */}
      {confirm && (
        <ConfirmModal
          message={confirm.type === 'category'
            ? `¿Eliminar la categoría "${confirm.name}"? Se eliminará permanentemente.`
            : `¿Archivar el plato "${confirm.name}"? Quedará oculto del TPV y la carta.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
          loading={confirmLoading}
        />
      )}
    </div>
  );
}
