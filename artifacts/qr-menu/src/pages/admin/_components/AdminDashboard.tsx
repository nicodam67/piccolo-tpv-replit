import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Button } from "@/components/ui/button.tsx";
import MenuTree from "./MenuTree.tsx";
import BrandingManager from "./BrandingManager.tsx";
import QRShare from "./QRShare.tsx";
import MenuExport from "./MenuExport.tsx";
import ChangePasswordForm from "./ChangePasswordForm.tsx";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BATCH_SIZE = 5;
const ALL_LOCALES = ["en", "fr", "de", "ca", "es", "it", "nl", "ro"];

export default function AdminDashboard() {
  const categories = useQuery(api.menu.listCategories, {});
  const items = useQuery(api.menu.listAllItems, {});
  const autoTranslate = useAction(api.translate.autoTranslate);
  const saveItemTranslations = useMutation(api.menu.saveItemTranslations);
  const saveCategoryTranslations = useMutation(api.menu.saveCategoryTranslations);

  const [translatingAll, setTranslatingAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  if (categories === undefined || items === undefined) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  async function runTranslation(targetLocales: string[], forceAll = false) {
    setTranslatingAll(true);
    let successCount = 0;
    let errorCount = 0;

    type WorkItem = {
      type: "category" | "item";
      id: string;
      name: string;
      description?: string;
      missingLocales: string[];
    };

    const workList: WorkItem[] = [
      ...(categories ?? []).flatMap((c) => {
        const existing = (c.translations ?? {}) as Record<string, { name?: string }>;
        const missingLocales = forceAll
          ? targetLocales
          : targetLocales.filter((l) => !existing[l]?.name?.trim());
        if (missingLocales.length === 0) return [];
        return [{ type: "category" as const, id: c._id, name: c.name, description: c.description || undefined, missingLocales }];
      }),
      ...(items ?? []).flatMap((i) => {
        const existing = (i.translations ?? {}) as Record<string, { name?: string }>;
        const missingLocales = forceAll
          ? targetLocales
          : targetLocales.filter((l) => !existing[l]?.name?.trim());
        if (missingLocales.length === 0) return [];
        return [{ type: "item" as const, id: i._id, name: i.name, description: i.description || undefined, missingLocales }];
      }),
    ];

    const total = workList.length;
    if (total === 0) {
      toast.success("Todo ya está traducido");
      setTranslatingAll(false);
      return;
    }
    setProgress({ done: 0, total });

    for (let i = 0; i < workList.length; i += BATCH_SIZE) {
      const batch = workList.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (work) => {
          try {
            const result = await autoTranslate({
              name: work.name,
              description: work.description,
              locales: work.missingLocales,
            });
            if (work.type === "category") {
              await saveCategoryTranslations({
                id: work.id as Parameters<typeof saveCategoryTranslations>[0]["id"],
                translations: result,
                merge: true,
              });
            } else {
              await saveItemTranslations({
                id: work.id as Parameters<typeof saveItemTranslations>[0]["id"],
                translations: result,
                merge: true,
              });
            }
            successCount++;
          } catch {
            errorCount++;
          }
          setProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null);
        })
      );
    }

    setTranslatingAll(false);
    setProgress(null);

    if (errorCount === 0) {
      toast.success(`${successCount} elementos traducidos correctamente`);
    } else {
      toast.warning(`${successCount} traducidos, ${errorCount} fallidos`);
    }
  }

  // Count items missing English
  const missingEnglish = (items ?? []).filter(
    (i) => !(i.translations as Record<string, { name?: string }>)?.en?.name?.trim()
  ).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Tabs defaultValue="menu">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <TabsList>
            <TabsTrigger value="menu" className="cursor-pointer">
              Menú <span className="ml-1.5 text-xs text-muted-foreground">({items.length})</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="cursor-pointer">Branding</TabsTrigger>
            <TabsTrigger value="share" className="cursor-pointer">QR & Share</TabsTrigger>
            <TabsTrigger value="export" className="cursor-pointer">Exportar</TabsTrigger>
            <TabsTrigger value="cuenta" className="cursor-pointer">Cuenta</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap">
            {progress && (
              <span className="text-xs text-muted-foreground">
                {progress.done}/{progress.total}
              </span>
            )}
            {missingEnglish > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="cursor-pointer gap-1.5"
                onClick={() => runTranslation(["en"], true)}
                disabled={translatingAll}
                title={`Traducir ${missingEnglish} platos al inglés`}
              >
                {translatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                {translatingAll ? `Traduciendo… ${progress ? `${progress.done}/${progress.total}` : ""}` : `→ English (${missingEnglish})`}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer gap-1.5"
              onClick={() => runTranslation(ALL_LOCALES)}
              disabled={translatingAll}
              title="Traducir automáticamente todos los platos y categorías a todos los idiomas"
            >
              {translatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
              {translatingAll ? `Traduciendo… ${progress ? `${progress.done}/${progress.total}` : ""}` : "Translate All"}
            </Button>
          </div>
        </div>

        <TabsContent value="menu">
          <MenuTree categories={sortedCategories} items={items} />
        </TabsContent>
        <TabsContent value="branding">
          <BrandingManager />
        </TabsContent>
        <TabsContent value="share">
          <QRShare />
        </TabsContent>
        <TabsContent value="export">
          <MenuExport />
        </TabsContent>
        <TabsContent value="cuenta">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
