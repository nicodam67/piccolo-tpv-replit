import { useState, useRef } from "react";
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
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ImageIcon, Loader2, Languages, VideoIcon } from "lucide-react";
import { DIETARY_TAGS, getTagMeta } from "@/lib/dietary-tags.ts";
import { ALLERGENS } from "@/lib/allergens.ts";
import { cn } from "@/lib/utils.ts";
import { SUPPORTED_LOCALES, SUPPORTED_LOCALES_ARRAY } from "@/i18n.ts";

type TranslationMap = Record<string, { name?: string; description?: string }>;

type Props = {
  categories: Doc<"categories">[];
  items: Doc<"menuItems">[];
};

type FormState = {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  halfPortionEnabled: boolean;
  halfPortionPrice: string;
  imageUrl: string;
  imageStorageId: string;
  videoUrl: string;
  videoStorageId: string;
  quantity: string;
  quantityUnit: string;
  available: boolean;
  order: string;
  tags: string[];
  allergens: string[];
  translations: TranslationMap;
};

const emptyForm = (defaultCategoryId = ""): FormState => ({
  categoryId: defaultCategoryId,
  name: "",
  description: "",
  price: "",
  halfPortionEnabled: false,
  halfPortionPrice: "",
  imageUrl: "",
  imageStorageId: "",
  videoUrl: "",
  videoStorageId: "",
  quantity: "",
  quantityUnit: "g",
  available: true,
  order: "1",
  tags: [],
  allergens: [],
  translations: {},
});

const NON_ENGLISH_LOCALES = SUPPORTED_LOCALES_ARRAY.filter((l) => l !== "en");

export default function ItemManager({ categories, items }: Props) {
  const createItem = useMutation(api.menu.createMenuItem);
  const updateItem = useMutation(api.menu.updateMenuItem);
  const deleteItem = useMutation(api.menu.deleteMenuItem);
  const toggleAvailability = useMutation(api.menu.toggleItemAvailability);
  const generateUploadUrl = useMutation(api.menu.generateUploadUrl);
  const autoTranslate = useAction(api.translate.autoTranslate);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"menuItems"> | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  function openCreate() {
    setEditing(null);
    const defaultCat = categories[0]?._id ?? "";
    const catItems = items.filter((i) => i.categoryId === defaultCat);
    setForm({ ...emptyForm(defaultCat), order: String(catItems.length + 1) });
    setOpen(true);
  }

  function openEdit(item: Doc<"menuItems">) {
    setEditing(item);
    setForm({
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      halfPortionEnabled: item.halfPortionPrice !== undefined,
      halfPortionPrice: item.halfPortionPrice !== undefined ? String(item.halfPortionPrice) : "",
      imageUrl: item.imageUrl ?? "",
      imageStorageId: (item.imageStorageId as string) ?? "",
      videoUrl: item.videoUrl ?? "",
      videoStorageId: (item.videoStorageId as string) ?? "",
      quantity: item.quantity ? item.quantity.replace(/[^0-9.]/g, "") : "",
      quantityUnit: item.quantity ? (item.quantity.replace(/[0-9. ]/g, "") || "g") : "g",
      available: item.available,
      order: String(item.order),
      tags: item.tags ?? [],
      allergens: item.allergens ?? [],
      translations: (item.translations as TranslationMap) ?? {},
    });
    setOpen(true);
  }

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
      // Store the storageId; the backend will resolve the URL
      // Photo and video are mutually exclusive — setting a photo clears the video
      setForm((f) => ({ ...f, imageStorageId: storageId, imageUrl: URL.createObjectURL(file), videoUrl: "", videoStorageId: "" }));
      toast.success("Imagen subida correctamente");
    } catch {
      toast.error("Error al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleVideoUpload(file: File) {
    setUploadingVideo(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
      // Photo and video are mutually exclusive — setting a video clears the photo
      setForm((f) => ({ ...f, videoStorageId: storageId, videoUrl: URL.createObjectURL(file), imageUrl: "", imageStorageId: "" }));
      toast.success("Vídeo subido correctamente");
    } catch {
      toast.error("Error al subir el vídeo");
    } finally {
      setUploadingVideo(false);
    }
  }

  function toggleFormTag(tagId: string) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tagId) ? f.tags.filter((t) => t !== tagId) : [...f.tags, tagId],
    }));
  }

  function toggleFormAllergen(id: string) {
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(id) ? f.allergens.filter((a) => a !== id) : [...f.allergens, id],
    }));
  }

  function setTranslationField(locale: string, field: "name" | "description", value: string) {
    setForm((f) => ({
      ...f,
      translations: {
        ...f.translations,
        [locale]: { ...f.translations[locale], [field]: value },
      },
    }));
  }

  async function handleAutoTranslate() {
    if (!form.name.trim()) {
      toast.error("Enter a name first");
      return;
    }
    setTranslating(true);
    try {
      const result = await autoTranslate({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      setForm((f) => ({ ...f, translations: result as TranslationMap }));
      toast.success("Auto-translated to all languages");
    } catch {
      toast.error("Auto-translate failed");
    } finally {
      setTranslating(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.categoryId) { toast.error("Category is required"); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }

    let halfPortionPrice: number | undefined = undefined;
    if (form.halfPortionEnabled) {
      const hp = parseFloat(form.halfPortionPrice);
      if (isNaN(hp) || hp < 0) { toast.error("Enter a valid half portion price"); return; }
      halfPortionPrice = hp;
    }

    // Clean translations: remove empty entries.
    // If the base name/description changed while editing, drop the now-stale
    // translated value so the client shows the updated text (falls back to base
    // until re-translated) instead of an outdated translation.
    const baseDescriptionChanged = editing ? (editing.description ?? "") !== form.description.trim() : false;
    const baseNameChanged = editing ? editing.name !== form.name.trim() : false;
    const cleanTranslations: TranslationMap = {};
    for (const locale of NON_ENGLISH_LOCALES) {
      const t = form.translations[locale];
      const name = baseNameChanged ? undefined : (t?.name?.trim() || undefined);
      const description = baseDescriptionChanged ? undefined : (t?.description?.trim() || undefined);
      if (name || description) {
        cleanTranslations[locale] = { name, description };
      }
    }

    setSaving(true);
    try {
      const payload = {
        categoryId: form.categoryId as Id<"categories">,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price,
        imageUrl: form.imageStorageId ? undefined : (form.imageUrl.trim() || undefined),
        imageStorageId: form.imageStorageId ? (form.imageStorageId as Id<"_storage">) : undefined,
        videoUrl: form.videoStorageId ? undefined : (form.videoUrl.trim() || undefined),
        videoStorageId: form.videoStorageId ? (form.videoStorageId as Id<"_storage">) : undefined,
        quantity: form.quantity.trim() ? `${form.quantity.trim()} ${form.quantityUnit}` : undefined,
        available: form.available,
        order: Number(form.order) || 1,
        tags: form.tags.length > 0 ? form.tags : undefined,
        halfPortionPrice,
        allergens: form.allergens.length > 0 ? form.allergens : undefined,
        translations: Object.keys(cleanTranslations).length > 0 ? cleanTranslations : undefined,
      };
      if (editing) {
        await updateItem({ id: editing._id, ...payload });
        toast.success("Item updated");
      } else {
        await createItem(payload);
        toast.success("Item created");
      }
      setOpen(false);
    } catch {
      toast.error("Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: Doc<"menuItems">) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await deleteItem({ id: item._id });
      toast.success("Item deleted");
    } catch {
      toast.error("Failed to delete item");
    }
  }

  async function handleToggle(item: Doc<"menuItems">) {
    try {
      await toggleAvailability({ id: item._id, available: !item.available });
    } catch {
      toast.error("Failed to update availability");
    }
  }

  const filtered = filterCategory === "all"
    ? items
    : items.filter((i) => i.categoryId === filterCategory);

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.categoryId !== b.categoryId) {
      const aCat = categories.find((c) => c._id === a.categoryId)?.order ?? 0;
      const bCat = categories.find((c) => c._id === b.categoryId)?.order ?? 0;
      return aCat - bCat;
    }
    return a.order - b.order;
  });

  const getCategoryName = (id: Id<"categories">) =>
    categories.find((c) => c._id === id)?.name ?? "Unknown";

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40 cursor-pointer">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{sortedFiltered.length} items</span>
        </div>
        <Button size="sm" onClick={openCreate} className="cursor-pointer gap-1">
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {sortedFiltered.map((item) => (
          <div key={item._id} className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
            {/* Thumbnail */}
            <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="w-5 h-5" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate" style={{ fontFamily: "var(--font-serif)" }}>
                  {item.name}
                </span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {getCategoryName(item.categoryId)}
                </Badge>
                {!item.available && (
                  <Badge variant="destructive" className="text-xs shrink-0">Unavailable</Badge>
                )}
                {item.tags?.map((tagId) => {
                  const meta = getTagMeta(tagId);
                  if (!meta) return null;
                  return (
                    <span key={tagId} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", meta.color)}>
                      {meta.label}
                    </span>
                  );
                })}
                {item.translations && Object.keys(item.translations).length > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Languages className="w-3 h-3" />
                    {Object.keys(item.translations).length}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{item.description}</p>
            </div>

            {/* Price */}
            <div className="text-right shrink-0">
              <span className="text-sm font-medium block">€{item.price.toFixed(2)}</span>
              {item.halfPortionPrice !== undefined && (
                <span className="text-xs text-muted-foreground">½ €{item.halfPortionPrice.toFixed(2)}</span>
              )}
            </div>

            {/* Toggle availability */}
            <div className="flex items-center gap-1 shrink-0" title={item.available ? "Available" : "Unavailable"}>
              <Switch
                checked={item.available}
                onCheckedChange={() => handleToggle(item)}
                className="cursor-pointer"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="cursor-pointer" onClick={() => openEdit(item)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => handleDelete(item)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}

        {sortedFiltered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p>No items yet. Add your first menu item.</p>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "New Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content tabs: English + per language */}
            <Tabs defaultValue="en">
              <div className="flex items-center justify-between gap-2 mb-2">
                <TabsList className="flex-wrap h-auto gap-1">
                  {SUPPORTED_LOCALES_ARRAY.map((locale) => {
                    const meta = SUPPORTED_LOCALES[locale];
                    const hasTranslation =
                      (locale as string) === "en" ||
                      !!(form.translations[locale]?.name?.trim());
                    return (
                      <TabsTrigger
                        key={locale}
                        value={locale}
                        className={cn("cursor-pointer text-xs px-2 py-1 gap-1", !hasTranslation && locale !== "en" && "opacity-50")}
                      >
                        <span>{meta.emoji}</span>
                        <span className="hidden sm:inline">{meta.nativeName}</span>
                        <span className="sm:hidden">{locale.toUpperCase()}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="cursor-pointer shrink-0 gap-1.5 text-xs"
                  onClick={handleAutoTranslate}
                  disabled={translating || !form.name.trim()}
                >
                  {translating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Languages className="w-3.5 h-3.5" />
                  )}
                  Auto-translate
                </Button>
              </div>

              {/* English (original) */}
              <TabsContent value="en" className="space-y-3 mt-0">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g. Truffle Arancini"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Describe the dish..."
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </TabsContent>

              {/* Other languages */}
              {NON_ENGLISH_LOCALES.map((locale) => {
                const meta = SUPPORTED_LOCALES[locale];
                return (
                  <TabsContent key={locale} value={locale} className="space-y-3 mt-0">
                    <p className="text-xs text-muted-foreground">
                      {meta.name} translation — leave blank to fall back to English
                    </p>
                    <div className="space-y-1">
                      <Label>Name</Label>
                      <Input
                        placeholder={form.name || `Name in ${meta.name}...`}
                        value={form.translations[locale]?.name ?? ""}
                        onChange={(e) => setTranslationField(locale, "name", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Description</Label>
                      <Textarea
                        placeholder={form.description || `Description in ${meta.name}...`}
                        value={form.translations[locale]?.description ?? ""}
                        onChange={(e) => setTranslationField(locale, "description", e.target.value)}
                      />
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Precio *</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Orden</Label>
                <Input type="number" placeholder="1" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))} />
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1">
              <Label>Cantidad / Volumen</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="200"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="flex-1"
                />
                <Select
                  value={form.quantityUnit}
                  onValueChange={(v) => setForm((f) => ({ ...f, quantityUnit: v }))}
                >
                  <SelectTrigger className="w-24 cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="cl">cl</SelectItem>
                    <SelectItem value="l">l</SelectItem>
                    <SelectItem value="ud">ud</SelectItem>
                    <SelectItem value="ración">ración</SelectItem>
                    <SelectItem value="pz">pz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Opcional. Ej: 200 g, 0.5 l, 1 ración</p>
            </div>

            {/* Half portion */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  id="halfPortion"
                  checked={form.halfPortionEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, halfPortionEnabled: v, halfPortionPrice: v ? f.halfPortionPrice : "" }))}
                  className="cursor-pointer"
                />
                <Label htmlFor="halfPortion">Offer half portion</Label>
              </div>
              {form.halfPortionEnabled && (
                <div className="space-y-1">
                  <Label>Half portion price *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.halfPortionPrice}
                    onChange={(e) => setForm((f) => ({ ...f, halfPortionPrice: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Dietary tags */}
            <div className="space-y-2">
              <Label>Dietary Tags</Label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_TAGS.map((tag) => {
                  const active = form.tags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleFormTag(tag.id)}
                      className={cn(
                        "text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium",
                        active ? tag.color + " border-transparent" : "border-border text-muted-foreground hover:border-foreground/40",
                      )}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Allergens */}
            <div className="space-y-2">
              <Label>Allergens</Label>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((allergen) => {
                  const active = form.allergens.includes(allergen.id);
                  return (
                    <button
                      key={allergen.id}
                      type="button"
                      onClick={() => toggleFormAllergen(allergen.id)}
                      className={cn(
                        "text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium flex items-center gap-1",
                        active
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-transparent"
                          : "border-border text-muted-foreground hover:border-foreground/40",
                      )}
                    >
                      <span>{allergen.icon}</span>
                      {allergen.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Image */}
            <div className="space-y-2">
              <Label>Foto del plato</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Pega la URL de la imagen..."
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value, imageStorageId: "", videoUrl: "", videoStorageId: "" }))}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer shrink-0"
                  disabled={uploadingImage}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
              </div>
              {form.imageUrl && (
                <img src={form.imageUrl} alt="Preview" className="w-full h-40 object-cover rounded-md" />
              )}
            </div>

            {/* Video */}
            <div className="space-y-2">
              <Label>Vídeo del plato (opcional)</Label>
              <p className="text-xs text-muted-foreground">Si subes un vídeo, se mostrará en lugar de la foto.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Pega la URL del vídeo..."
                  value={form.videoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value, videoStorageId: "", imageUrl: "", imageStorageId: "" }))}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer shrink-0"
                  disabled={uploadingVideo}
                  onClick={() => videoInputRef.current?.click()}
                >
                  {uploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <VideoIcon className="w-4 h-4" />}
                </Button>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleVideoUpload(file);
                  }}
                />
              </div>
              {form.videoUrl && (
                <div className="relative w-full rounded-md overflow-hidden bg-black aspect-video">
                  <video
                    src={form.videoUrl}
                    className="w-full h-full object-cover"
                    controls
                    muted
                    playsInline
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, videoUrl: "", videoStorageId: "" }))}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs cursor-pointer hover:bg-black/80"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="available"
                checked={form.available}
                onCheckedChange={(v) => setForm((f) => ({ ...f, available: v }))}
                className="cursor-pointer"
              />
              <Label htmlFor="available">Available on menu</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || uploadingImage || uploadingVideo} className="cursor-pointer">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
