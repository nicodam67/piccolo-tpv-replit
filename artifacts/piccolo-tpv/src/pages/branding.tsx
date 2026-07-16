/**
 * Admin — Branding & Carta QR settings
 * Accessible at /admin/branding (admin only)
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Image, Phone, MapPin, Clock, Palette,
  Globe, Star, LayoutGrid, LayoutList, AlignJustify, Check,
} from 'lucide-react';
import {
  useGetAdminBranding,
  usePatchAdminBranding,
  getGetAdminBrandingQueryKey,
  getGetPublicBrandingQueryKey,
} from '@workspace/api-client-react';
import type { BrandingInput } from '@workspace/api-client-react';

const DAYS = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const LAYOUT_OPTIONS = [
  { value: 'grid', label: 'Grid', description: 'Tarjetas con foto', icon: <LayoutGrid size={20} /> },
  { value: 'list', label: 'Lista', description: 'Thumbnail lateral', icon: <LayoutList size={20} /> },
  { value: 'compact', label: 'Compacto', description: 'Solo texto', icon: <AlignJustify size={20} /> },
];

const ACCENT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#1a1a1a', '#d4af37',
];

interface DaySchedule {
  open: string;
  close: string;
  open2?: string;
  close2?: string;
}

type ScheduleMap = Record<string, DaySchedule>;

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">{title}</h3>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground font-semibold block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

export default function BrandingPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    const emp = localStorage.getItem('employee');
    if (!emp) { setLocation('/'); return; }
    try { const e = JSON.parse(emp); if (e.role !== 'admin') setLocation('/tables'); }
    catch { setLocation('/'); }
  }, [setLocation]);

  const { data: branding, isLoading } = useGetAdminBranding({
    query: { queryKey: getGetAdminBrandingQueryKey() },
  });

  const patch = usePatchAdminBranding();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [nombreComercial, setNombreComercial] = useState('');
  const [tagline, setTagline] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroVideoUrl, setHeroVideoUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [cardLayout, setCardLayout] = useState('grid');
  const [accentColor, setAccentColor] = useState('#ef4444');
  const [schedule, setSchedule] = useState<ScheduleMap>({});

  useEffect(() => {
    if (!branding) return;
    setNombreComercial(branding.nombreComercial ?? '');
    setTagline(branding.tagline ?? '');
    setFoundedYear(branding.foundedYear != null ? String(branding.foundedYear) : '');
    setHeroImageUrl(branding.heroImageUrl ?? '');
    setHeroVideoUrl(branding.heroVideoUrl ?? '');
    setLogoUrl(branding.logoUrl ?? '');
    setAddress(branding.address ?? '');
    setPhone(branding.phone ?? '');
    setCardLayout(branding.cardLayout ?? 'grid');
    setAccentColor(branding.accentColor ?? '#ef4444');
    setSchedule((branding.openingHours as ScheduleMap) ?? {});
  }, [branding]);

  const toggleDay = (key: string) => {
    setSchedule(prev => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; }
      else { next[key] = { open: '09:00', close: '16:00' }; }
      return next;
    });
  };

  const updateDay = (key: string, field: keyof DaySchedule, value: string) => {
    setSchedule(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const clearShift2 = (key: string) => {
    setSchedule(prev => {
      const next = { ...prev };
      const day = { ...next[key] };
      delete day.open2; delete day.close2;
      next[key] = day;
      return next;
    });
  };

  const addShift2 = (key: string) => {
    setSchedule(prev => ({
      ...prev,
      [key]: { ...prev[key], open2: '19:00', close2: '23:00' },
    }));
  };

  const handleSave = async () => {
    const payload: BrandingInput = {
      nombreComercial,
      tagline,
      heroImageUrl,
      heroVideoUrl,
      logoUrl,
      address,
      phone,
      foundedYear: foundedYear ? parseInt(foundedYear, 10) : null,
      openingHours: Object.keys(schedule).length > 0 ? schedule : null,
      cardLayout,
      accentColor,
    };

    try {
      await patch.mutateAsync({ data: payload });
      qc.invalidateQueries({ queryKey: getGetAdminBrandingQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPublicBrandingQueryKey() });
      toast.success('Branding guardado');
    } catch {
      toast.error('Error al guardar');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation('/admin')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-black text-base flex-1">Branding · Carta QR</h1>
        <button
          onClick={handleSave}
          disabled={patch.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          <Save size={13} /> Guardar
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Identidad */}
        <section>
          <SectionHeader icon={<Star size={15} />} title="Identidad" />
          <div className="space-y-3">
            <Field label="Nombre del restaurante">
              <Input value={nombreComercial} onChange={setNombreComercial} placeholder="Mi Restaurante" />
            </Field>
            <Field label="Tagline / eslogan">
              <Input value={tagline} onChange={setTagline} placeholder="La mejor cocina tradicional" />
            </Field>
            <Field label="Año de fundación">
              <Input type="number" value={foundedYear} onChange={setFoundedYear} placeholder="2010" />
            </Field>
            <Field label="URL del logo">
              <div className="flex gap-2">
                <input
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                {logoUrl && (
                  <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain border border-border bg-secondary/50"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
              </div>
            </Field>
          </div>
        </section>

        {/* Media del hero */}
        <section>
          <SectionHeader icon={<Image size={15} />} title="Hero (imagen / vídeo de portada)" />
          <div className="space-y-3">
            <Field label="URL de imagen hero">
              <div className="flex gap-2">
                <input value={heroImageUrl} onChange={e => setHeroImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                {heroImageUrl && (
                  <img src={heroImageUrl} alt="" className="w-16 h-10 rounded-lg object-cover border border-border"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
              </div>
            </Field>
            <Field label="URL de vídeo hero (MP4, opcional — tiene prioridad sobre la imagen)">
              <Input value={heroVideoUrl} onChange={setHeroVideoUrl} placeholder="https://…/hero.mp4" />
            </Field>
          </div>
        </section>

        {/* Contacto */}
        <section>
          <SectionHeader icon={<Phone size={15} />} title="Contacto" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <Input value={phone} onChange={setPhone} placeholder="+34 600 000 000" />
            </Field>
            <Field label="Dirección pública">
              <Input value={address} onChange={setAddress} placeholder="Calle Mayor 1, Madrid" />
            </Field>
          </div>
        </section>

        {/* Layout de la carta */}
        <section>
          <SectionHeader icon={<Globe size={15} />} title="Diseño de la carta QR" />
          <p className="text-xs text-muted-foreground mb-3">Layout por defecto para los platos. El visitante puede cambiarlo durante la sesión.</p>
          <div className="grid grid-cols-3 gap-3">
            {LAYOUT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCardLayout(opt.value)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${cardLayout === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/40'}`}
              >
                {opt.icon}
                <div>
                  <p className="text-xs font-bold">{opt.label}</p>
                  <p className="text-[10px] opacity-70">{opt.description}</p>
                </div>
                {cardLayout === opt.value && <Check size={12} className="text-primary" />}
              </button>
            ))}
          </div>
        </section>

        {/* Color de acento */}
        <section>
          <SectionHeader icon={<Palette size={15} />} title="Color de acento" />
          <div className="flex flex-wrap gap-3 items-center">
            {ACCENT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setAccentColor(c)}
                className="w-9 h-9 rounded-xl transition-all active:scale-90 flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: c,
                  boxShadow: accentColor === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : 'none',
                }}
              >
                {accentColor === c && <Check size={14} color="white" strokeWidth={3} />}
              </button>
            ))}
            <input
              type="color"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              className="w-9 h-9 rounded-xl cursor-pointer border-0 bg-transparent p-0"
              title="Color personalizado"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: accentColor }} />
            <span className="text-xs font-mono text-muted-foreground">{accentColor}</span>
          </div>
        </section>

        {/* Horario */}
        <section>
          <SectionHeader icon={<Clock size={15} />} title="Horario de apertura" />
          <p className="text-xs text-muted-foreground mb-3">Activa los días que abres. Puedes añadir un segundo turno.</p>
          <div className="space-y-2">
            {DAYS.map(({ key, label }) => {
              const day = schedule[key];
              return (
                <div key={key} className={`rounded-xl border transition-all ${day ? 'border-primary/30 bg-primary/3' : 'border-border bg-secondary/10'}`}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => toggleDay(key)}
                      className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-all ${day ? 'bg-primary border-primary' : 'border-border'}`}
                    >
                      {day && <Check size={11} className="text-primary-foreground" />}
                    </button>
                    <span className="text-sm font-semibold w-24 shrink-0">{label}</span>
                    {day ? (
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        <div className="flex items-center gap-1">
                          <input type="time" value={day.open} onChange={e => updateDay(key, 'open', e.target.value)}
                            className="bg-secondary rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary" />
                          <span className="text-xs text-muted-foreground">–</span>
                          <input type="time" value={day.close} onChange={e => updateDay(key, 'close', e.target.value)}
                            className="bg-secondary rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary" />
                        </div>
                        {day.open2 ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">2º:</span>
                            <input type="time" value={day.open2 ?? ''} onChange={e => updateDay(key, 'open2', e.target.value)}
                              className="bg-secondary rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary" />
                            <span className="text-xs text-muted-foreground">–</span>
                            <input type="time" value={day.close2 ?? ''} onChange={e => updateDay(key, 'close2', e.target.value)}
                              className="bg-secondary rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary" />
                            <button onClick={() => clearShift2(key)} className="text-[10px] text-muted-foreground hover:text-destructive ml-1">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => addShift2(key)} className="text-[10px] text-primary hover:underline">+ 2º turno</button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Cerrado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
