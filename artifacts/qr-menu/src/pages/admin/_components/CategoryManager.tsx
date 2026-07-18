import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Languages, Loader2, FolderPlus, ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { SUPPORTED_LOCALES, SUPPORTED_LOCALES_ARRAY } from "@/i18n.ts";
import { cn } from "@/lib/utils.ts";

type TranslationMap = Record<string, { name?: string; description?: string }>;
type Props = { categories: Doc<"categories">[] };
type FormState = { name: string; description: string; order: string; translations: TranslationMap; parentId: Id<"categories"> | null };

const emptyForm = (): FormState => ({ name: "", description: "", order: "", translations: {}, parentId: null });
const NON_ENGLISH_LOCALES = SUPPORTED_LOCALES_ARRAY.filter((l) => l !== "en");

export default function CategoryManager({ categories }: Props) {
  const createCategory = useMutation(api.menu.createCategory);
  const updateCategory = useMutation(api.menu.updateCategory);
  const deleteCategory = useMutation(api.menu.deleteCategory);
  const toggleCategoryAvailable = useMutation(api.menu.toggleCategoryAvailable);
  const autoTranslate = useAction(api.translate.autoTranslate);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"categories"> | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Top-level categories only
  const topLevel = [...categories].filter((c) => !c.parentId).sort((a, b) => a.order - b.order);

  function getSubcategories(parentId: string) {
    return [...categories].filter((c) => c.parentId === parentId).sort((a, b) => a.order - b.order);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate(parentId: Id<"categories"> | null = null) {
    setEditing(null);
    const siblings = parentId
      ? categories.filter((c) => c.parentId === parentId)
      : categories.filter((c) => !c.parentId);
    setForm({ name: "", description: "", order: String(siblings.length + 1), translations: {}, parentId });
    setOpen(true);
  }

  function openEdit(cat: Doc<"categories">) {
    setEditing(cat);
    setForm({
      name: cat.name,
      description: cat.description ?? "",
      order: String(cat.order),
      translations: (cat.translations as TranslationMap) ?? {},
      parentId: (cat.parentId as Id<"categories">) ?? null,
    });
    setOpen(true);
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
    if (!form.name.trim()) { toast.error("Enter a name first"); return; }
    setTranslating(true);
    try {
      const result = await autoTranslate({ name: form.name.trim(), description: form.description.trim() || undefined });
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

    // If the base name/description changed while editing, drop the now-stale
    // translated value so the client shows the updated text (falls back to base
    // until re-translated) instead of an outdated translation.
    const baseNameChanged = editing ? editing.name !== form.name.trim() : false;
    const baseDescriptionChanged = editing ? (editing.description ?? "") !== form.description.trim() : false;
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
      const translations = Object.keys(cleanTranslations).length > 0 ? cleanTranslations : undefined;
      if (editing) {
        await updateCategory({
          id: editing._id,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          order: Number(form.order) || editing.order,
          parentId: form.parentId ?? undefined,
          translations,
        });
        toast.success("Category updated");
      } else {
        await createCategory({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          order: Number(form.order) || categories.length + 1,
          parentId: form.parentId ?? undefined,
          translations,
        });
        toast.success("Category created");
        // Auto-expand parent after adding subcategory
        if (form.parentId) {
          setExpandedIds((prev) => new Set([...prev, form.parentId as string]));
        }
      }
      setOpen(false);
    } catch {
      toast.error("Failed to save category");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: Doc<"categories">) {
    const subs = getSubcategories(cat._id);
    const msg = subs.length > 0
      ? `Delete "${cat.name}" and its ${subs.length} subcategory(ies) and all items?`
      : `Delete "${cat.name}" and all its items?`;
    if (!confirm(msg)) return;
    try {
      // Delete subcategories first
      for (const sub of subs) {
        await deleteCategory({ id: sub._id });
      }
      await deleteCategory({ id: cat._id });
      toast.success("Category deleted");
    } catch {
      toast.error("Failed to delete category");
    }
  }

  function CategoryRow({ cat, depth = 0 }: { cat: Doc<"categories">; depth?: number }) {
    const subs = getSubcategories(cat._id);
    const hasSubs = subs.length > 0;
    const isExpanded = expandedIds.has(cat._id);
    // available defaults to true if not set
    const isAvailable = cat.available !== false;

    async function handleToggleAvailable() {
      try {
        await toggleCategoryAvailable({ id: cat._id, available: !isAvailable });
        toast.success(isAvailable ? `"${cat.name}" ocultada del menú` : `"${cat.name}" visible en el menú`);
      } catch {
        toast.error("Error al cambiar disponibilidad");
      }
    }

    return (
      <div>
        <div
          className={cn(
            "flex items-center justify-between p-3 rounded-lg border border-border bg-card",
            depth > 0 && "bg-muted/30",
            !isAvailable && "opacity-50",
          )}
          style={{ marginLeft: depth * 20 }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Expand toggle */}
            <button
              onClick={() => hasSubs && toggleExpand(cat._id)}
              className={cn("shrink-0 p-0.5 rounded transition-colors", hasSubs ? "cursor-pointer hover:bg-muted" : "cursor-default opacity-0")}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate" style={{ fontFamily: "var(--font-serif)" }}>{cat.name}</p>
                {!isAvailable && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">oculta</span>
                )}
                {hasSubs && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                    {subs.length}
                  </span>
                )}
                {cat.translations && Object.keys(cat.translations).length > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0">
                    <Languages className="w-3 h-3" />
                    {Object.keys(cat.translations).length}
                  </span>
                )}
              </div>
              {cat.description && <p className="text-xs text-muted-foreground truncate">{cat.description}</p>}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {/* Available toggle */}
            <Button
              size="icon"
              variant="ghost"
              className="cursor-pointer"
              title={isAvailable ? "Ocultar del menú" : "Mostrar en el menú"}
              onClick={handleToggleAvailable}
            >
              {isAvailable
                ? <Eye className="w-4 h-4 text-green-600" />
                : <EyeOff className="w-4 h-4 text-muted-foreground" />}
            </Button>
            {/* Add subcategory button (only for top-level) */}
            {depth === 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="cursor-pointer"
                title="Add subcategory"
                onClick={() => openCreate(cat._id)}
              >
                <FolderPlus className="w-4 h-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="cursor-pointer" onClick={() => openEdit(cat)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => handleDelete(cat)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* Subcategories */}
        {hasSubs && isExpanded && (
          <div className="mt-1 space-y-1">
            {subs.map((sub) => (
              <CategoryRow key={sub._id} cat={sub} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">Manage menu sections and subcategories</p>
        <Button size="sm" onClick={() => openCreate(null)} className="cursor-pointer gap-1">
          <Plus className="w-4 h-4" /> Add Category
        </Button>
      </div>

      <div className="space-y-2">
        {topLevel.map((cat) => (
          <CategoryRow key={cat._id} cat={cat} />
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? "Edit Category"
                : form.parentId
                  ? `New Subcategory`
                  : "New Category"}
            </DialogTitle>
            {!editing && form.parentId && (
              <p className="text-sm text-muted-foreground">
                Under: <strong>{categories.find((c) => c._id === form.parentId)?.name}</strong>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <Tabs defaultValue="en">
              <div className="flex items-center justify-between gap-2 mb-2">
                <TabsList className="flex-wrap h-auto gap-1">
                  {SUPPORTED_LOCALES_ARRAY.map((locale) => {
                    const meta = SUPPORTED_LOCALES[locale];
                    const hasTranslation = (locale as string) === "en" || !!(form.translations[locale]?.name?.trim());
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
                  {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  Auto-translate
                </Button>
              </div>

              <TabsContent value="en" className="space-y-3 mt-0">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input placeholder="e.g. Vino Blanco" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea placeholder="Short description..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
              </TabsContent>

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

            <div className="space-y-1">
              <Label>Display Order</Label>
              <Input type="number" placeholder="1" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
