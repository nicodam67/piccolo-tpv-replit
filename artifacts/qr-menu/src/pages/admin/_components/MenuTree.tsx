import { useState, useRef, useCallback } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ImageIcon, Loader2, Languages, VideoIcon,
  ChevronDown, ChevronRight, FolderPlus, GripVertical, Eye, EyeOff,
} from "lucide-react";
import { DIETARY_TAGS } from "@/lib/dietary-tags.ts";
import { ALLERGENS } from "@/lib/allergens.ts";
import { cn } from "@/lib/utils.ts";
import { SUPPORTED_LOCALES, SUPPORTED_LOCALES_ARRAY } from "@/i18n.ts";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Types ─────────────────────────────────────────────────────────────────────

type TranslationMap = Record<string, { name?: string; description?: string }>;

type ItemForm = {
  categoryId: string; name: string; description: string; price: string;
  halfPortionEnabled: boolean; halfPortionPrice: string;
  imageUrl: string; imageStorageId: string; videoUrl: string; videoStorageId: string;
  quantity: string; quantityUnit: string; available: boolean; order: string;
  tags: string[]; allergens: string[]; translations: TranslationMap;
};

type CatForm = {
  name: string; description: string; order: string;
  parentId: Id<"categories"> | null; translations: TranslationMap;
};

const emptyItemForm = (defaultCategoryId = ""): ItemForm => ({
  categoryId: defaultCategoryId, name: "", description: "", price: "",
  halfPortionEnabled: false, halfPortionPrice: "",
  imageUrl: "", imageStorageId: "", videoUrl: "", videoStorageId: "",
  quantity: "", quantityUnit: "g", available: true, order: "1",
  tags: [], allergens: [], translations: {},
});

const emptyCatForm = (): CatForm => ({ name: "", description: "", order: "", parentId: null, translations: {} });

const NON_ENGLISH = SUPPORTED_LOCALES_ARRAY.filter((l) => l !== "en");

// ── Tree callbacks type ───────────────────────────────────────────────────────

type TreeCallbacks = {
  openCreateItem: (catId: string) => void;
  openEditItem: (item: Doc<"menuItems">) => void;
  handleDeleteItem: (item: Doc<"menuItems">) => void;
  openCreateCat: (parentId: Id<"categories"> | null) => void;
  openEditCat: (cat: Doc<"categories">) => void;
  handleDeleteCat: (cat: Doc<"categories">) => void;
  toggleAvailability: (id: Id<"menuItems">, available: boolean) => void;
  toggleCategoryAvailable: (id: Id<"categories">, available: boolean) => void;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  setExpanded: (id: string) => void;
  getSubcategories: (parentId: string) => Doc<"categories">[];
  getCategoryItems: (catId: string) => Doc<"menuItems">[];
  handleCatDragEnd: (event: DragEndEvent, parentId: string | null) => void;
  handleItemDragEnd: (event: DragEndEvent, catId: string) => void;
  onDragStart: () => void;
  sensors: ReturnType<typeof useSensors>;
};

// ── Sortable item row ─────────────────────────────────────────────────────────

function SortableItemRow({
  item,
  callbacks,
}: {
  item: Doc<"menuItems">;
  callbacks: TreeCallbacks;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors mb-0.5">
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-0.5">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
      </span>
      <div className="w-9 h-9 rounded-md overflow-hidden bg-muted shrink-0">
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-muted-foreground/40"><ImageIcon className="w-3.5 h-3.5" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm truncate block", !item.available && "opacity-40 line-through")}>{item.name}</span>
        {item.description && <span className="text-xs text-muted-foreground truncate block">{item.description}</span>}
      </div>
      <div className="text-right shrink-0">
        <span className="text-sm font-medium">€{item.price.toFixed(2)}</span>
        {item.halfPortionPrice !== undefined && (
          <span className="text-xs text-muted-foreground block">½ €{item.halfPortionPrice.toFixed(2)}</span>
        )}
      </div>
      <Button
        size="icon" variant="ghost" className="w-7 h-7 cursor-pointer shrink-0"
        title={item.available ? "Ocultar del menú" : "Mostrar en el menú"}
        onClick={() => callbacks.toggleAvailability(item._id, !item.available)}
      >
        {item.available
          ? <Eye className="w-3.5 h-3.5 text-green-600" />
          : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
      </Button>
      <div className="flex gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer" onClick={() => callbacks.openEditItem(item)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer text-destructive hover:text-destructive" onClick={() => callbacks.handleDeleteItem(item)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Sortable category row ─────────────────────────────────────────────────────

function SortableCategoryRow({
  cat,
  depth,
  callbacks,
}: {
  cat: Doc<"categories">;
  depth: number;
  callbacks: TreeCallbacks;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat._id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const subs = callbacks.getSubcategories(cat._id);
  const catItems = callbacks.getCategoryItems(cat._id);
  const isExpanded = callbacks.expandedIds.has(cat._id);
  const hasChildren = subs.length > 0 || catItems.length > 0;
  const isAvailable = cat.available !== false;

  return (
    <div ref={setNodeRef} style={style} className={cn(depth > 0 && "ml-5 border-l border-border/40 pl-3")}>
      {/* Category header row */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-card mb-1",
        depth === 0 ? "border-border" : "border-border/50 bg-muted/20",
        !isAvailable && "opacity-60",
      )}>
        <span {...attributes} {...listeners} className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-0.5">
          <GripVertical className="w-4 h-4 text-muted-foreground/50" />
        </span>

        <button
          onClick={() => hasChildren && callbacks.toggleExpand(cat._id)}
          className={cn("shrink-0 p-0.5 rounded transition-colors", hasChildren ? "cursor-pointer hover:bg-muted" : "opacity-0 pointer-events-none")}
        >
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>

        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm" style={{ fontFamily: "var(--font-serif)" }}>{cat.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {subs.length > 0 && `${subs.length} subcats · `}{catItems.length} platos
          </span>
          {!isAvailable && (
            <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">oculta</span>
          )}
        </div>

        <div className="flex gap-1 shrink-0">
          {/* Visibility toggle */}
          <Button
            size="icon" variant="ghost" className="w-7 h-7 cursor-pointer"
            title={isAvailable ? "Ocultar del menú" : "Mostrar en el menú"}
            onClick={() => callbacks.toggleCategoryAvailable(cat._id as Id<"categories">, !isAvailable)}
          >
            {isAvailable
              ? <Eye className="w-3.5 h-3.5 text-green-600" />
              : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
          </Button>
          {depth === 0 && (
            <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer" title="Añadir subcategoría"
              onClick={() => { callbacks.openCreateCat(cat._id as Id<"categories">); }}>
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer" title="Añadir plato"
            onClick={() => { callbacks.openCreateItem(cat._id); callbacks.setExpanded(cat._id); }}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer" onClick={() => callbacks.openEditCat(cat)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer text-destructive hover:text-destructive"
            onClick={() => callbacks.handleDeleteCat(cat)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Children */}
      {isExpanded && (
        <div className="mb-2">
          {subs.length > 0 && (
            <DndContext
              sensors={callbacks.sensors}
              collisionDetection={closestCenter}
              onDragStart={callbacks.onDragStart}
              onDragEnd={(e) => callbacks.handleCatDragEnd(e, cat._id)}
            >
              <SortableContext items={subs.map((s) => s._id)} strategy={verticalListSortingStrategy}>
                {subs.map((sub) => (
                  <SortableCategoryRow key={sub._id} cat={sub} depth={depth + 1} callbacks={callbacks} />
                ))}
              </SortableContext>
            </DndContext>
          )}
          {catItems.length > 0 && (
            <DndContext
              sensors={callbacks.sensors}
              collisionDetection={closestCenter}
              onDragStart={callbacks.onDragStart}
              onDragEnd={(e) => callbacks.handleItemDragEnd(e, cat._id)}
            >
              <SortableContext items={catItems.map((i) => i._id)} strategy={verticalListSortingStrategy}>
                {catItems.map((item) => (
                  <SortableItemRow key={item._id} item={item} callbacks={callbacks} />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  categories: Doc<"categories">[];
  items: Doc<"menuItems">[];
};

// ── Main component ────────────────────────────────────────────────────────────

export default function MenuTree({ categories: propCategories, items: propItems }: Props) {
  const createItem = useMutation(api.menu.createMenuItem);
  const updateItem = useMutation(api.menu.updateMenuItem);
  const deleteItem = useMutation(api.menu.deleteMenuItem);
  const toggleAvailabilityMutation = useMutation(api.menu.toggleItemAvailability);
  const generateUploadUrl = useMutation(api.menu.generateUploadUrl);
  const createCategory = useMutation(api.menu.createCategory);
  const updateCategory = useMutation(api.menu.updateCategory);
  const deleteCategoryMutation = useMutation(api.menu.deleteCategory);
  const reorderCategoriesMutation = useMutation(api.menu.reorderCategories);
  const reorderItemsMutation = useMutation(api.menu.reorderItems);
  const toggleCategoryAvailableMutation = useMutation(api.menu.toggleCategoryAvailable);
  const autoTranslate = useAction(api.translate.autoTranslate);

  // Local sorted state for optimistic reordering
  const [localCategories, setLocalCategories] = useState<Doc<"categories">[]>(() =>
    [...propCategories].sort((a, b) => a.order - b.order)
  );
  const [localItems, setLocalItems] = useState<Doc<"menuItems">[]>(() =>
    [...propItems].sort((a, b) => a.order - b.order)
  );

  // Sync from props when data changes (new/deleted items), but not during drag
  const isDraggingRef = useRef(false);
  const prevCatLen = useRef(propCategories.length);
  const prevItemLen = useRef(propItems.length);
  // Track a hash of available states to detect field-level changes
  const prevCatAvailableHash = useRef(propCategories.map((c) => `${c._id}:${c.available}`).join(","));
  if (!isDraggingRef.current) {
    const catAvailableHash = propCategories.map((c) => `${c._id}:${c.available}`).join(",");
    if (propCategories.length !== prevCatLen.current || catAvailableHash !== prevCatAvailableHash.current) {
      prevCatLen.current = propCategories.length;
      prevCatAvailableHash.current = catAvailableHash;
      setLocalCategories([...propCategories].sort((a, b) => a.order - b.order));
    }
    if (propItems.length !== prevItemLen.current) {
      prevItemLen.current = propItems.length;
      setLocalItems([...propItems].sort((a, b) => a.order - b.order));
    }
  }

  // Also sync item available field changes (without length change)
  const prevItemAvailableHash = useRef(propItems.map((i) => `${i._id}:${i.available}`).join(","));
  if (!isDraggingRef.current) {
    const itemAvailableHash = propItems.map((i) => `${i._id}:${i.available}`).join(",");
    if (itemAvailableHash !== prevItemAvailableHash.current) {
      prevItemAvailableHash.current = itemAvailableHash;
      setLocalItems([...propItems].sort((a, b) => a.order - b.order));
    }
  }

  // Item dialog
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Doc<"menuItems"> | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm());
  const [savingItem, setSavingItem] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [translatingItem, setTranslatingItem] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Category dialog
  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Doc<"categories"> | null>(null);
  const [catForm, setCatForm] = useState<CatForm>(emptyCatForm());
  const [savingCat, setSavingCat] = useState(false);
  const [translatingCat, setTranslatingCat] = useState(false);

  // Expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    propCategories.filter((c) => !c.parentId).forEach((c) => ids.add(c._id));
    return ids;
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => new Set([...prev, id]));
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getSubcategories = useCallback((parentId: string) => {
    return localCategories.filter((c) => c.parentId === parentId);
  }, [localCategories]);

  const getCategoryItems = useCallback((catId: string) => {
    return localItems.filter((i) => i.categoryId === catId);
  }, [localItems]);

  // ── Drag end handlers ─────────────────────────────────────────────────────────

  const handleCatDragEnd = useCallback((event: DragEndEvent, parentId: string | null) => {
    isDraggingRef.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalCategories((prev) => {
      const siblings = prev.filter((c) =>
        parentId === null ? !c.parentId : c.parentId === parentId
      );
      const others = prev.filter((c) =>
        parentId === null ? !!c.parentId : c.parentId !== parentId
      );
      const oldIndex = siblings.findIndex((c) => c._id === active.id);
      const newIndex = siblings.findIndex((c) => c._id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(siblings, oldIndex, newIndex);
      reorderCategoriesMutation({ ids: reordered.map((c) => c._id) }).catch(() =>
        toast.error("Error al reordenar")
      );
      return [...others, ...reordered];
    });
  }, [reorderCategoriesMutation]);

  const handleItemDragEnd = useCallback((event: DragEndEvent, catId: string) => {
    isDraggingRef.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalItems((prev) => {
      const catItems = prev.filter((i) => i.categoryId === catId);
      const others = prev.filter((i) => i.categoryId !== catId);
      const oldIndex = catItems.findIndex((i) => i._id === active.id);
      const newIndex = catItems.findIndex((i) => i._id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(catItems, oldIndex, newIndex);
      reorderItemsMutation({ ids: reordered.map((i) => i._id) }).catch(() =>
        toast.error("Error al reordenar")
      );
      return [...others, ...reordered];
    });
  }, [reorderItemsMutation]);

  const onDragStart = useCallback(() => { isDraggingRef.current = true; }, []);

  const toggleAvailability = useCallback((id: Id<"menuItems">, available: boolean) => {
    // Optimistic update
    setLocalItems((prev) =>
      prev.map((i) => i._id === id ? { ...i, available } : i)
    );
    toggleAvailabilityMutation({ id, available }).catch(() => {
      // Revert on error
      setLocalItems((prev) =>
        prev.map((i) => i._id === id ? { ...i, available: !available } : i)
      );
      toast.error("Error");
    });
  }, [toggleAvailabilityMutation]);

  const toggleCategoryAvailable = useCallback((id: Id<"categories">, available: boolean) => {
    // Optimistic update
    setLocalCategories((prev) =>
      prev.map((c) => c._id === id ? { ...c, available } : c)
    );
    toggleCategoryAvailableMutation({ id, available })
      .then(() => toast.success(available ? "Categoría visible en el menú" : "Categoría oculta del menú"))
      .catch(() => {
        // Revert on error
        setLocalCategories((prev) =>
          prev.map((c) => c._id === id ? { ...c, available: !available } : c)
        );
        toast.error("Error al cambiar visibilidad");
      });
  }, [toggleCategoryAvailableMutation]);

  // ── Item dialog ───────────────────────────────────────────────────────────────

  const openCreateItem = useCallback((catId: string) => {
    setEditingItem(null);
    setLocalItems((prev) => {
      const count = prev.filter((i) => i.categoryId === catId).length;
      setItemForm({ ...emptyItemForm(catId), order: String(count + 1) });
      return prev;
    });
    setItemOpen(true);
  }, []);

  const openEditItem = useCallback((item: Doc<"menuItems">) => {
    setEditingItem(item);
    setItemForm({
      categoryId: item.categoryId,
      name: item.name, description: item.description ?? "",
      price: String(item.price),
      halfPortionEnabled: item.halfPortionPrice !== undefined,
      halfPortionPrice: item.halfPortionPrice !== undefined ? String(item.halfPortionPrice) : "",
      imageUrl: item.imageUrl ?? "", imageStorageId: (item.imageStorageId as string) ?? "",
      videoUrl: item.videoUrl ?? "", videoStorageId: (item.videoStorageId as string) ?? "",
      quantity: item.quantity ? item.quantity.replace(/[^0-9.]/g, "") : "",
      quantityUnit: item.quantity ? (item.quantity.replace(/[0-9. ]/g, "").trim() || "none") : "g",
      available: item.available, order: String(item.order),
      tags: item.tags ?? [], allergens: item.allergens ?? [],
      translations: (item.translations as TranslationMap) ?? {},
    });
    setItemOpen(true);
  }, []);

  const handleDeleteItem = useCallback(async (item: Doc<"menuItems">) => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    try { await deleteItem({ id: item._id }); toast.success("Eliminado"); }
    catch { toast.error("Failed to delete item"); }
  }, [deleteItem]);

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
      setItemForm((f) => ({ ...f, imageStorageId: storageId, imageUrl: URL.createObjectURL(file) }));
      toast.success("Imagen subida");
    } catch { toast.error("Error al subir la imagen"); }
    finally { setUploadingImage(false); }
  }

  async function handleVideoUpload(file: File) {
    setUploadingVideo(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
      setItemForm((f) => ({ ...f, videoStorageId: storageId, videoUrl: URL.createObjectURL(file) }));
      toast.success("Vídeo subido");
    } catch { toast.error("Error al subir el vídeo"); }
    finally { setUploadingVideo(false); }
  }

  async function handleAutoTranslateItem() {
    if (!itemForm.name.trim()) { toast.error("Enter a name first"); return; }
    setTranslatingItem(true);
    try {
      const result = await autoTranslate({ name: itemForm.name.trim(), description: itemForm.description.trim() || undefined });
      setItemForm((f) => ({ ...f, translations: result as TranslationMap }));
      toast.success("Traducido automáticamente");
    } catch { toast.error("Auto-translate failed"); }
    finally { setTranslatingItem(false); }
  }

  async function handleSaveItem() {
    if (!itemForm.name.trim()) { toast.error("Name is required"); return; }
    if (!itemForm.categoryId) { toast.error("Category is required"); return; }
    const price = parseFloat(itemForm.price);
    if (isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }
    let halfPortionPrice: number | undefined;
    if (itemForm.halfPortionEnabled) {
      const hp = parseFloat(itemForm.halfPortionPrice);
      if (isNaN(hp) || hp < 0) { toast.error("Enter a valid half portion price"); return; }
      halfPortionPrice = hp;
    }
    const cleanTranslations: TranslationMap = {};
    for (const locale of NON_ENGLISH) {
      const t = itemForm.translations[locale];
      if (t?.name?.trim() || t?.description?.trim()) {
        cleanTranslations[locale] = { name: t.name?.trim() || undefined, description: t.description?.trim() || undefined };
      }
    }
    setSavingItem(true);
    try {
      const payload = {
        categoryId: itemForm.categoryId as Id<"categories">,
        name: itemForm.name.trim(), description: itemForm.description.trim() || undefined, price,
        imageUrl: itemForm.imageStorageId ? undefined : (itemForm.imageUrl.trim() || undefined),
        imageStorageId: itemForm.imageStorageId ? (itemForm.imageStorageId as Id<"_storage">) : undefined,
        videoUrl: itemForm.videoStorageId ? undefined : (itemForm.videoUrl.trim() || undefined),
        videoStorageId: itemForm.videoStorageId ? (itemForm.videoStorageId as Id<"_storage">) : undefined,
        quantity: (itemForm.quantityUnit === "none" ? null : (itemForm.quantity.trim() ? `${itemForm.quantity.trim()} ${itemForm.quantityUnit}` : undefined)) as string | undefined,
        available: itemForm.available, order: Number(itemForm.order) || 1,
        tags: itemForm.tags.length > 0 ? itemForm.tags : undefined,
        halfPortionPrice,
        allergens: itemForm.allergens.length > 0 ? itemForm.allergens : undefined,
        translations: Object.keys(cleanTranslations).length > 0 ? cleanTranslations : undefined,
      };
      if (editingItem) { await updateItem({ id: editingItem._id, ...payload }); toast.success("Item updated"); }
      else { await createItem(payload); toast.success("Item created"); }
      setItemOpen(false);
    } catch { toast.error("Failed to save item"); }
    finally { setSavingItem(false); }
  }

  // ── Category dialog ───────────────────────────────────────────────────────────

  const openCreateCat = useCallback((parentId: Id<"categories"> | null = null) => {
    setEditingCat(null);
    setLocalCategories((prev) => {
      const siblings = parentId
        ? prev.filter((c) => c.parentId === parentId)
        : prev.filter((c) => !c.parentId);
      setCatForm({ name: "", description: "", order: String(siblings.length + 1), parentId, translations: {} });
      return prev;
    });
    setCatOpen(true);
  }, []);

  const openEditCat = useCallback((cat: Doc<"categories">) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name, description: cat.description ?? "", order: String(cat.order),
      parentId: (cat.parentId as Id<"categories">) ?? null,
      translations: (cat.translations as TranslationMap) ?? {},
    });
    setCatOpen(true);
  }, []);

  async function handleAutoTranslateCat() {
    if (!catForm.name.trim()) { toast.error("Enter a name first"); return; }
    setTranslatingCat(true);
    try {
      const result = await autoTranslate({ name: catForm.name.trim(), description: catForm.description.trim() || undefined });
      setCatForm((f) => ({ ...f, translations: result as TranslationMap }));
      toast.success("Traducido automáticamente");
    } catch { toast.error("Auto-translate failed"); }
    finally { setTranslatingCat(false); }
  }

  async function handleSaveCat() {
    if (!catForm.name.trim()) { toast.error("Name is required"); return; }
    const cleanTranslations: TranslationMap = {};
    for (const locale of NON_ENGLISH) {
      const t = catForm.translations[locale];
      if (t?.name?.trim() || t?.description?.trim()) {
        cleanTranslations[locale] = { name: t.name?.trim() || undefined, description: t.description?.trim() || undefined };
      }
    }
    setSavingCat(true);
    try {
      const translations = Object.keys(cleanTranslations).length > 0 ? cleanTranslations : undefined;
      if (editingCat) {
        await updateCategory({ id: editingCat._id, name: catForm.name.trim(), description: catForm.description.trim() || undefined, order: Number(catForm.order) || editingCat.order, parentId: catForm.parentId ?? undefined, translations });
        toast.success("Categoría actualizada");
      } else {
        await createCategory({ name: catForm.name.trim(), description: catForm.description.trim() || undefined, order: Number(catForm.order) || localCategories.length + 1, parentId: catForm.parentId ?? undefined, translations });
        if (catForm.parentId) setExpanded(catForm.parentId);
        toast.success("Categoría creada");
      }
      setCatOpen(false);
    } catch { toast.error("Failed to save category"); }
    finally { setSavingCat(false); }
  }

  const handleDeleteCat = useCallback(async (cat: Doc<"categories">) => {
    const subs = localCategories.filter((c) => c.parentId === cat._id);
    const msg = subs.length > 0
      ? `¿Eliminar "${cat.name}" y sus ${subs.length} subcategorías con todos sus platos?`
      : `¿Eliminar "${cat.name}" y todos sus platos?`;
    if (!confirm(msg)) return;
    try {
      for (const sub of subs) await deleteCategoryMutation({ id: sub._id });
      await deleteCategoryMutation({ id: cat._id });
      toast.success("Categoría eliminada");
    } catch { toast.error("Failed to delete category"); }
  }, [localCategories, deleteCategoryMutation]);

  // ── Build callbacks object ────────────────────────────────────────────────────

  const callbacks: TreeCallbacks = {
    openCreateItem, openEditItem, handleDeleteItem,
    openCreateCat, openEditCat, handleDeleteCat,
    toggleAvailability, toggleCategoryAvailable,
    expandedIds, toggleExpand, setExpanded,
    getSubcategories, getCategoryItems,
    handleCatDragEnd, handleItemDragEnd, onDragStart,
    sensors,
  };

  const topLevel = localCategories.filter((c) => !c.parentId);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{topLevel.length} categorías · {localItems.length} platos</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => openCreateCat(null)} className="cursor-pointer gap-1">
            <FolderPlus className="w-4 h-4" /> Categoría
          </Button>
          <Button size="sm" onClick={() => openCreateItem(localCategories[0]?._id ?? "")} className="cursor-pointer gap-1">
            <Plus className="w-4 h-4" /> Plato
          </Button>
        </div>
      </div>

      {/* Top-level categories */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={(e) => handleCatDragEnd(e, null)}
      >
        <SortableContext items={topLevel.map((c) => c._id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {topLevel.map((cat) => (
              <SortableCategoryRow key={cat._id} cat={cat} depth={0} callbacks={callbacks} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* ── Item Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar plato" : "Nuevo plato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Categoría *</Label>
              <Select value={itemForm.categoryId} onValueChange={(v) => setItemForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                <SelectContent>
                  {localCategories.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.parentId ? `  ↳ ${c.name}` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs defaultValue="en">
              <div className="flex items-center justify-between gap-2 mb-2">
                <TabsList className="flex-wrap h-auto gap-1">
                  {SUPPORTED_LOCALES_ARRAY.map((locale) => {
                    const meta = SUPPORTED_LOCALES[locale];
                    const has = (locale as string) === "en" || !!(itemForm.translations[locale]?.name?.trim());
                    return (
                      <TabsTrigger key={locale} value={locale} className={cn("cursor-pointer text-xs px-2 py-1 gap-1", !has && locale !== "en" && "opacity-50")}>
                        <span>{meta.emoji}</span><span className="hidden sm:inline">{meta.nativeName}</span>
                        <span className="sm:hidden">{locale.toUpperCase()}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                <Button type="button" size="sm" variant="secondary" className="cursor-pointer shrink-0 gap-1.5 text-xs" onClick={handleAutoTranslateItem} disabled={translatingItem || !itemForm.name.trim()}>
                  {translatingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  Auto-translate
                </Button>
              </div>
              <TabsContent value="en" className="space-y-3 mt-0">
                <div className="space-y-1">
                  <Label>Nombre *</Label>
                  <Input placeholder="ej. Truffle Arancini" value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Descripción</Label>
                  <Textarea placeholder="Describe el plato..." value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
              </TabsContent>
              {NON_ENGLISH.map((locale) => {
                const meta = SUPPORTED_LOCALES[locale];
                return (
                  <TabsContent key={locale} value={locale} className="space-y-3 mt-0">
                    <p className="text-xs text-muted-foreground">{meta.name} — deja en blanco para usar el inglés</p>
                    <div className="space-y-1"><Label>Nombre</Label>
                      <Input placeholder={itemForm.name} value={itemForm.translations[locale]?.name ?? ""} onChange={(e) => setItemForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], name: e.target.value } } }))} />
                    </div>
                    <div className="space-y-1"><Label>Descripción</Label>
                      <Textarea placeholder={itemForm.description} value={itemForm.translations[locale]?.description ?? ""} onChange={(e) => setItemForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], description: e.target.value } } }))} />
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Precio *</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="space-y-1"><Label>Orden</Label>
                <Input type="number" placeholder="1" value={itemForm.order} onChange={(e) => setItemForm((f) => ({ ...f, order: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Cantidad / Volumen</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" step="any" placeholder="200" value={itemForm.quantity} onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))} className="flex-1" />
                <Select value={itemForm.quantityUnit} onValueChange={(v) => setItemForm((f) => ({ ...f, quantityUnit: v }))}>
                  <SelectTrigger className="w-24 cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— sin unidad</SelectItem>
                    {["g", "kg", "ml", "cl", "l", "ud", "ración", "pz"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch id="halfPortion" checked={itemForm.halfPortionEnabled} onCheckedChange={(v) => setItemForm((f) => ({ ...f, halfPortionEnabled: v, halfPortionPrice: v ? f.halfPortionPrice : "" }))} className="cursor-pointer" />
                <Label htmlFor="halfPortion">Ofrecer media ración</Label>
              </div>
              {itemForm.halfPortionEnabled && (
                <div className="space-y-1"><Label>Precio media ración *</Label>
                  <Input type="number" min="0" step="0.01" placeholder="0.00" value={itemForm.halfPortionPrice} onChange={(e) => setItemForm((f) => ({ ...f, halfPortionPrice: e.target.value }))} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Etiquetas dietéticas</Label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_TAGS.map((tag) => {
                  const active = itemForm.tags.includes(tag.id);
                  return (
                    <button key={tag.id} type="button" onClick={() => setItemForm((f) => ({ ...f, tags: active ? f.tags.filter((t) => t !== tag.id) : [...f.tags, tag.id] }))}
                      className={cn("text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium", active ? tag.color + " border-transparent" : "border-border text-muted-foreground hover:border-foreground/40")}>
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Alérgenos</Label>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((a) => {
                  const active = itemForm.allergens.includes(a.id);
                  return (
                    <button key={a.id} type="button" onClick={() => setItemForm((f) => ({ ...f, allergens: active ? f.allergens.filter((x) => x !== a.id) : [...f.allergens, a.id] }))}
                      className={cn("text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium flex items-center gap-1", active ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-transparent" : "border-border text-muted-foreground hover:border-foreground/40")}>
                      <span>{a.icon}</span>{a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Foto del plato</Label>
              <div className="flex gap-2">
                <Input placeholder="URL de la imagen..." value={itemForm.imageUrl} onChange={(e) => setItemForm((f) => ({ ...f, imageUrl: e.target.value, imageStorageId: "" }))} className="flex-1" />
                <Button type="button" variant="secondary" size="sm" className="cursor-pointer" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()}>
                  {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                </Button>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
              </div>
              {itemForm.imageUrl && <img src={itemForm.imageUrl} alt="Preview" className="w-full h-40 object-cover rounded-md" />}
            </div>

            <div className="space-y-2">
              <Label>Vídeo del plato (opcional)</Label>
              <div className="flex gap-2">
                <Input placeholder="URL del vídeo..." value={itemForm.videoUrl} onChange={(e) => setItemForm((f) => ({ ...f, videoUrl: e.target.value, videoStorageId: "" }))} className="flex-1" />
                <Button type="button" variant="secondary" size="sm" className="cursor-pointer" disabled={uploadingVideo} onClick={() => videoInputRef.current?.click()}>
                  {uploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <VideoIcon className="w-4 h-4" />}
                </Button>
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); }} />
              </div>
              {itemForm.videoUrl && (
                <div className="relative w-full rounded-md overflow-hidden bg-black aspect-video">
                  <video src={itemForm.videoUrl} className="w-full h-full object-cover" controls muted playsInline />
                  <button type="button" onClick={() => setItemForm((f) => ({ ...f, videoUrl: "", videoStorageId: "" }))} className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs cursor-pointer hover:bg-black/80">✕</button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch id="available" checked={itemForm.available} onCheckedChange={(v) => setItemForm((f) => ({ ...f, available: v }))} className="cursor-pointer" />
              <Label htmlFor="available">Disponible en carta</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setItemOpen(false)} className="cursor-pointer">Cancelar</Button>
            <Button onClick={handleSaveItem} disabled={savingItem || uploadingImage || uploadingVideo} className="cursor-pointer">
              {savingItem ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Category Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCat ? "Editar categoría" : catForm.parentId ? "Nueva subcategoría" : "Nueva categoría"}</DialogTitle>
            {!editingCat && catForm.parentId && (
              <p className="text-sm text-muted-foreground">Dentro de: <strong>{localCategories.find((c) => c._id === catForm.parentId)?.name}</strong></p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <Tabs defaultValue="en">
              <div className="flex items-center justify-between gap-2 mb-2">
                <TabsList className="flex-wrap h-auto gap-1">
                  {SUPPORTED_LOCALES_ARRAY.map((locale) => {
                    const meta = SUPPORTED_LOCALES[locale];
                    const has = (locale as string) === "en" || !!(catForm.translations[locale]?.name?.trim());
                    return (
                      <TabsTrigger key={locale} value={locale} className={cn("cursor-pointer text-xs px-2 py-1 gap-1", !has && locale !== "en" && "opacity-50")}>
                        <span>{meta.emoji}</span><span className="hidden sm:inline">{meta.nativeName}</span>
                        <span className="sm:hidden">{locale.toUpperCase()}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                <Button type="button" size="sm" variant="secondary" className="cursor-pointer shrink-0 gap-1.5 text-xs" onClick={handleAutoTranslateCat} disabled={translatingCat || !catForm.name.trim()}>
                  {translatingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  Auto-translate
                </Button>
              </div>
              <TabsContent value="en" className="space-y-3 mt-0">
                <div className="space-y-1"><Label>Nombre *</Label>
                  <Input placeholder="ej. Entrantes" value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1"><Label>Descripción</Label>
                  <Textarea placeholder="Descripción breve..." value={catForm.description} onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
              </TabsContent>
              {NON_ENGLISH.map((locale) => {
                const meta = SUPPORTED_LOCALES[locale];
                return (
                  <TabsContent key={locale} value={locale} className="space-y-3 mt-0">
                    <p className="text-xs text-muted-foreground">{meta.name} — deja en blanco para usar el inglés</p>
                    <div className="space-y-1"><Label>Nombre</Label>
                      <Input placeholder={catForm.name} value={catForm.translations[locale]?.name ?? ""} onChange={(e) => setCatForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], name: e.target.value } } }))} />
                    </div>
                    <div className="space-y-1"><Label>Descripción</Label>
                      <Textarea placeholder={catForm.description} value={catForm.translations[locale]?.description ?? ""} onChange={(e) => setCatForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], description: e.target.value } } }))} />
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
            <div className="space-y-1"><Label>Orden de visualización</Label>
              <Input type="number" placeholder="1" value={catForm.order} onChange={(e) => setCatForm((f) => ({ ...f, order: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatOpen(false)} className="cursor-pointer">Cancelar</Button>
            <Button onClick={handleSaveCat} disabled={savingCat} className="cursor-pointer">
              {savingCat ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
