import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import ScheduleManager, { DEFAULT_SCHEDULE } from "./ScheduleManager.tsx";
import ThemeColorManager, { DEFAULT_COLORS, DEFAULT_ENABLED } from "./ThemeColorManager.tsx";
import FontManager, { DEFAULT_FONTS } from "./FontManager.tsx";
import CardSettingsManager, { DEFAULT_CARD_SETTINGS } from "./CardSettingsManager.tsx";
import type { ThemeColors, EnabledColors } from "./ThemeColorManager.tsx";
import type { ThemeFonts } from "./FontManager.tsx";
import type { CardSettings } from "./CardSettingsManager.tsx";
import type { DaySchedule } from "./ScheduleManager.tsx";
import { UploadCloud, X, Link as LinkIcon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const schema = z.object({
  restaurantName: z.string().min(1, "El nombre del restaurante es obligatorio"),
  tagline: z.string().optional(),
  heroImageUrl: z.string().url("Debe ser una URL válida").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  establishedYear: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function BrandingManager() {
  const branding = useQuery(api.branding.get, {});
  const upsert = useMutation(api.branding.upsert);
  const generateUploadUrl = useMutation(api.branding.generateUploadUrl);

  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [themeColors, setThemeColors] = useState<ThemeColors>(DEFAULT_COLORS);
  const [enabledColors, setEnabledColors] = useState<EnabledColors>(DEFAULT_ENABLED);
  const [themeFonts, setThemeFonts] = useState<ThemeFonts>(DEFAULT_FONTS);
  const [cardSettings, setCardSettings] = useState<CardSettings>(DEFAULT_CARD_SETTINGS);

  // Image state: "url" | "file"
  const [imageMode, setImageMode] = useState<"url" | "file">("url");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedStorageId, setUploadedStorageId] = useState<Id<"_storage"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video state
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadedVideoStorageId, setUploadedVideoStorageId] = useState<Id<"_storage"> | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      restaurantName: "",
      tagline: "",
      heroImageUrl: "",
      address: "",
      city: "",
      province: "",
      postalCode: "",
      country: "",
      phone: "",
      establishedYear: "",
    },
  });

  const heroImageUrlValue = watch("heroImageUrl");

  // Populate form once branding loads
  useEffect(() => {
    if (branding !== undefined) {
      reset({
        restaurantName: branding?.restaurantName ?? "",
        tagline: branding?.tagline ?? "",
        heroImageUrl: branding?.heroImageUrl ?? "",
        address: branding?.address ?? "",
        city: branding?.city ?? "",
        province: branding?.province ?? "",
        postalCode: branding?.postalCode ?? "",
        country: branding?.country ?? "",
        phone: branding?.phone ?? "",
        establishedYear: branding?.establishedYear ?? "",
      });
      if (branding?.schedule && branding.schedule.length > 0) {
        setSchedule(branding.schedule);
      }
      if (branding?.themeColors) {
        setThemeColors({
          primary: branding.themeColors.primary ?? DEFAULT_COLORS.primary,
          background: branding.themeColors.background ?? DEFAULT_COLORS.background,
          accent: branding.themeColors.accent ?? DEFAULT_COLORS.accent,
          infoTextColor: branding.themeColors.infoTextColor ?? DEFAULT_COLORS.infoTextColor,
          categoryCardBg: branding.themeColors.categoryCardBg ?? DEFAULT_COLORS.categoryCardBg,
          categoryCardText: branding.themeColors.categoryCardText ?? DEFAULT_COLORS.categoryCardText,
          callButtonBg: branding.themeColors.callButtonBg ?? DEFAULT_COLORS.callButtonBg,
          callButtonText: branding.themeColors.callButtonText ?? DEFAULT_COLORS.callButtonText,
          scheduleButtonBg: branding.themeColors.scheduleButtonBg ?? DEFAULT_COLORS.scheduleButtonBg,
          scheduleButtonText: branding.themeColors.scheduleButtonText ?? DEFAULT_COLORS.scheduleButtonText,
          heroTitleColor: branding.themeColors.heroTitleColor ?? DEFAULT_COLORS.heroTitleColor,
          heroTaglineColor: branding.themeColors.heroTaglineColor ?? DEFAULT_COLORS.heroTaglineColor,
          heroEstablishedColor: branding.themeColors.heroEstablishedColor ?? DEFAULT_COLORS.heroEstablishedColor,
          tapDetailsColor: branding.themeColors.tapDetailsColor ?? DEFAULT_COLORS.tapDetailsColor,
        });
        // Reconstruct which colors are enabled based on what's stored
        setEnabledColors({
          primary: branding.themeColors.primary !== undefined,
          background: branding.themeColors.background !== undefined,
          accent: branding.themeColors.accent !== undefined,
          infoTextColor: branding.themeColors.infoTextColor !== undefined,
          categoryCardBg: branding.themeColors.categoryCardBg !== undefined,
          categoryCardText: branding.themeColors.categoryCardText !== undefined,
          callButtonBg: branding.themeColors.callButtonBg !== undefined,
          callButtonText: branding.themeColors.callButtonText !== undefined,
          scheduleButtonBg: branding.themeColors.scheduleButtonBg !== undefined,
          scheduleButtonText: branding.themeColors.scheduleButtonText !== undefined,
          heroTitleColor: branding.themeColors.heroTitleColor !== undefined,
          heroTaglineColor: branding.themeColors.heroTaglineColor !== undefined,
          heroEstablishedColor: branding.themeColors.heroEstablishedColor !== undefined,
          tapDetailsColor: branding.themeColors.tapDetailsColor !== undefined,
        });
      }
      if (branding?.themeFonts) {
        setThemeFonts({
          heading: branding.themeFonts.heading ?? DEFAULT_FONTS.heading,
          body: branding.themeFonts.body ?? DEFAULT_FONTS.body,
          headingColor: branding.themeFonts.headingColor ?? DEFAULT_FONTS.headingColor,
          bodyColor: branding.themeFonts.bodyColor ?? DEFAULT_FONTS.bodyColor,
        });
      }
      if (branding?.cardSettings) {
        const cs = branding.cardSettings;
        setCardSettings({
          showImage: cs.showImage ?? DEFAULT_CARD_SETTINGS.showImage,
          showDescription: cs.showDescription ?? DEFAULT_CARD_SETTINGS.showDescription,
          showTags: cs.showTags ?? DEFAULT_CARD_SETTINGS.showTags,
          showAllergens: cs.showAllergens ?? DEFAULT_CARD_SETTINGS.showAllergens,
          showPrice: cs.showPrice ?? DEFAULT_CARD_SETTINGS.showPrice,
          showHalfPortion: cs.showHalfPortion ?? DEFAULT_CARD_SETTINGS.showHalfPortion,
          showQuantity: cs.showQuantity ?? DEFAULT_CARD_SETTINGS.showQuantity,
          layout: (cs.layout as CardSettings["layout"]) ?? DEFAULT_CARD_SETTINGS.layout,
        });
      }
      // If already has a storage ID, reflect that
      if (branding?.heroImageStorageId) {
        setImageMode("file");
        setPreviewUrl(branding.heroImageUrl ?? null);
      }
      // If already has a video, reflect that
      if (branding?.heroVideoStorageId) {
        setVideoPreviewUrl(branding.heroVideoUrl ?? null);
        setUploadedVideoStorageId(branding.heroVideoStorageId as Id<"_storage">);
      } else if (branding?.heroVideoUrl) {
        setVideoPreviewUrl(branding.heroVideoUrl);
      }
    }
  }, [branding, reset]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadedStorageId(null);
  }

  function clearFile() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadedStorageId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadFile(): Promise<Id<"_storage"> | null> {
    if (!selectedFile) return uploadedStorageId;
    setUploading(true);
    try {
      const postUrl = await generateUploadUrl();
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json() as { storageId: Id<"_storage"> };
      setUploadedStorageId(storageId);
      setSelectedFile(null);
      return storageId;
    } finally {
      setUploading(false);
    }
  }

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setUploadedVideoStorageId(null);
  }

  function clearVideo() {
    setSelectedVideoFile(null);
    setVideoPreviewUrl(null);
    setUploadedVideoStorageId(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  async function uploadVideoFile(): Promise<Id<"_storage"> | null> {
    if (!selectedVideoFile) return uploadedVideoStorageId;
    setUploadingVideo(true);
    try {
      const postUrl = await generateUploadUrl();
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": selectedVideoFile.type },
        body: selectedVideoFile,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json() as { storageId: Id<"_storage"> };
      setUploadedVideoStorageId(storageId);
      setSelectedVideoFile(null);
      return storageId;
    } finally {
      setUploadingVideo(false);
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      let storageId: Id<"_storage"> | undefined;
      if (imageMode === "file") {
        const sid = await uploadFile();
        storageId = sid ?? undefined;
      }

      let videoStorageId: Id<"_storage"> | undefined;
      if (selectedVideoFile) {
        const sid = await uploadVideoFile();
        videoStorageId = sid ?? undefined;
      } else {
        videoStorageId = uploadedVideoStorageId ?? undefined;
      }

      await upsert({
        restaurantName: values.restaurantName,
        tagline: values.tagline || undefined,
        heroImageUrl: imageMode === "url" ? (values.heroImageUrl || undefined) : undefined,
        heroImageStorageId: storageId,
        heroVideoStorageId: videoStorageId,
        address: values.address || undefined,
        city: values.city || undefined,
        province: values.province || undefined,
        postalCode: values.postalCode || undefined,
        country: values.country || undefined,
        phone: values.phone || undefined,
        establishedYear: values.establishedYear || undefined,
        schedule,
        themeColors: {
          primary: enabledColors.primary !== false ? themeColors.primary : undefined,
          background: enabledColors.background !== false ? themeColors.background : undefined,
          accent: enabledColors.accent !== false ? themeColors.accent : undefined,
          infoTextColor: enabledColors.infoTextColor !== false ? themeColors.infoTextColor : undefined,
          categoryCardBg: enabledColors.categoryCardBg !== false ? themeColors.categoryCardBg : undefined,
          categoryCardText: enabledColors.categoryCardText !== false ? themeColors.categoryCardText : undefined,
          callButtonBg: enabledColors.callButtonBg !== false ? themeColors.callButtonBg : undefined,
          callButtonText: enabledColors.callButtonText !== false ? themeColors.callButtonText : undefined,
          scheduleButtonBg: enabledColors.scheduleButtonBg !== false ? themeColors.scheduleButtonBg : undefined,
          scheduleButtonText: enabledColors.scheduleButtonText !== false ? themeColors.scheduleButtonText : undefined,
          heroTitleColor: enabledColors.heroTitleColor !== false ? themeColors.heroTitleColor : undefined,
          heroTaglineColor: enabledColors.heroTaglineColor !== false ? themeColors.heroTaglineColor : undefined,
          heroEstablishedColor: enabledColors.heroEstablishedColor !== false ? themeColors.heroEstablishedColor : undefined,
          tapDetailsColor: enabledColors.tapDetailsColor !== false ? themeColors.tapDetailsColor : undefined,
        },
        themeFonts,
        cardSettings,
      });
      toast.success("Cambios guardados correctamente");
    } catch {
      toast.error("Error al guardar los cambios");
    }
  }

  if (branding === undefined) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  // Current preview: file blob > existing branding URL
  const currentPreview = previewUrl ?? (imageMode === "url" && heroImageUrlValue ? heroImageUrlValue : null)
    ?? (imageMode === "url" ? null : branding?.heroImageUrl ?? null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle style={{ fontFamily: "var(--font-serif)" }}>Información del restaurante</CardTitle>
          <CardDescription>
            Personaliza cómo se muestra tu restaurante en el menú público.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Restaurant Name */}
            <div className="space-y-1.5">
              <Label htmlFor="restaurantName">Nombre del restaurante *</Label>
              <Input id="restaurantName" placeholder="La Maison" {...register("restaurantName")} />
              {errors.restaurantName && (
                <p className="text-xs text-destructive">{errors.restaurantName.message}</p>
              )}
            </div>

            {/* Tagline */}
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Eslogan</Label>
              <Input
                id="tagline"
                placeholder="Un menú de temporada con los mejores ingredientes locales"
                {...register("tagline")}
              />
            </div>

            {/* Hero Image */}
            <div className="space-y-2">
              <Label>Imagen de portada</Label>

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setImageMode("url"); clearFile(); }}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                    imageMode === "url"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode("file")}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                    imageMode === "file"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Archivo
                </button>
              </div>

              {imageMode === "url" ? (
                <div className="space-y-1">
                  <Input
                    id="heroImageUrl"
                    placeholder="https://example.com/foto-restaurante.jpg"
                    {...register("heroImageUrl")}
                  />
                  {errors.heroImageUrl && (
                    <p className="text-xs text-destructive">{errors.heroImageUrl.message}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-foreground/40 transition-colors"
                  >
                    <UploadCloud className="w-7 h-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground text-center">
                      Haz clic para seleccionar una imagen
                    </p>
                    <p className="text-xs text-muted-foreground/60">JPG, PNG, WEBP — máx. 10 MB</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* Preview */}
              {currentPreview && (
                <div className="relative mt-2 rounded-lg overflow-hidden border border-border">
                  <img
                    src={currentPreview}
                    alt="Vista previa"
                    className="w-full h-36 object-cover"
                  />
                  {imageMode === "file" && (
                    <button
                      type="button"
                      onClick={clearFile}
                      className="absolute top-2 right-2 bg-background/80 hover:bg-background border border-border rounded-full p-1 cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground px-2 py-1">Vista previa</p>
                </div>
              )}
            </div>

            {/* Hero Video */}
            <div className="space-y-2">
              <Label>Vídeo de portada (opcional)</Label>
              <p className="text-xs text-muted-foreground">Si subes un vídeo, se mostrará en lugar de la imagen de fondo.</p>
              <div
                onClick={() => videoInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-5 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-foreground/40 transition-colors"
              >
                <UploadCloud className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">Haz clic para seleccionar un vídeo</p>
                <p className="text-xs text-muted-foreground/60">MP4, MOV, WEBM — máx. 50 MB · recomendado: bucle corto 5-15 seg</p>
              </div>
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoChange} />
              {videoPreviewUrl && (
                <div className="relative mt-2 rounded-lg overflow-hidden border border-border">
                  <video src={videoPreviewUrl} className="w-full h-36 object-cover" autoPlay loop muted playsInline />
                  <button
                    type="button"
                    onClick={clearVideo}
                    className="absolute top-2 right-2 bg-background/80 hover:bg-background border border-border rounded-full p-1 cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-xs text-muted-foreground px-2 py-1">Vista previa del vídeo</p>
                </div>
              )}
            </div>

            {/* Address + Location */}
            <div className="space-y-3">
              <Label className="text-base">Dirección</Label>
              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-sm text-muted-foreground">Calle y número</Label>
                <Input id="address" placeholder="Calle Mayor, 12" {...register("address")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode" className="text-sm text-muted-foreground">Código postal</Label>
                  <Input id="postalCode" placeholder="08001" {...register("postalCode")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-sm text-muted-foreground">Ciudad</Label>
                  <Input id="city" placeholder="Barcelona" {...register("city")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="province" className="text-sm text-muted-foreground">Provincia</Label>
                  <Input id="province" placeholder="Barcelona" {...register("province")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country" className="text-sm text-muted-foreground">País</Label>
                  <Input id="country" placeholder="España" {...register("country")} />
                </div>
              </div>
            </div>

            {/* Phone + Established */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" type="tel" placeholder="+34 912 345 678" {...register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="establishedYear">Año de fundación</Label>
                <Input id="establishedYear" placeholder="2018" {...register("establishedYear")} />
              </div>
            </div>

            {/* Theme Colors */}
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-base">Colores del menú</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Personaliza los colores que verán tus clientes en la carta digital.
                </p>
              </div>
              <ThemeColorManager
                colors={themeColors}
                enabledColors={enabledColors}
                onChange={(colors, enabled) => { setThemeColors(colors); setEnabledColors(enabled); }}
              />
            </div>

            {/* Theme Fonts */}
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-base">Tipografía del menú</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Elige las fuentes para los títulos y el texto de tu carta digital.
                </p>
              </div>
              <FontManager fonts={themeFonts} onChange={setThemeFonts} />
            </div>

            {/* Card Settings */}
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-base">Tarjetas de productos</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Controla qué información y cómo se muestran los platos en la carta digital.
                </p>
              </div>
              <CardSettingsManager settings={cardSettings} onChange={setCardSettings} />
            </div>

            {/* Schedule */}
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-base">Horario por días</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Activa o desactiva cada día y configura el horario de apertura y cierre.
                </p>
              </div>
              <ScheduleManager schedule={schedule} onChange={setSchedule} />
            </div>

            <Button type="submit" disabled={isSubmitting || uploading || uploadingVideo} className="cursor-pointer">
              {isSubmitting || uploading || uploadingVideo ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
