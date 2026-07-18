/**
 * /admin/qr-menu — Módulo unificado de QR Menú
 * 4 tabs: Menú | Branding | QR & Share | Exportar
 * Tema oscuro, coherente con el resto del panel de administración.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Loader2, Save, Check, LayoutGrid, Palette, QrCode, Download,
  Languages, Monitor, Printer, X, Settings, ChevronLeft, Shield,
} from 'lucide-react';
import type { QrBranding } from './types';
import { DEFAULT_THEME_COLORS, DEFAULT_THEME_FONTS, DEFAULT_CARD_SETTINGS, DEFAULT_SCHEDULE } from './types';
import { fetchQrBranding, saveQrBranding } from './lib';
import TabMenuTree from './TabMenuTree';
import TabBranding from './TabBranding';
import TabQRShare from './TabQRShare';
import TabExport from './TabExport';

type TabId = 'menu' | 'branding' | 'qr' | 'export' | 'ajustes';

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string; size?: number }> }[] = [
  { id: 'menu',     label: 'Menú',        Icon: LayoutGrid },
  { id: 'branding', label: 'Branding',    Icon: Palette },
  { id: 'qr',       label: 'QR & Share',  Icon: QrCode },
  { id: 'export',   label: 'Exportar',    Icon: Download },
  { id: 'ajustes',  label: 'Ajustes',     Icon: Settings },
];

const DEFAULT_BRANDING: QrBranding = {
  restaurantName: '', tagline: '', heroImageUrl: '', heroVideoUrl: '',
  address: '', city: '', province: '', postalCode: '', country: '',
  phone: '', establishedYear: '', logoUrl: '',
  themeColors: DEFAULT_THEME_COLORS,
  themeFonts: DEFAULT_THEME_FONTS,
  cardSettings: DEFAULT_CARD_SETTINGS,
  schedule: DEFAULT_SCHEDULE,
};

export default function QrMenuPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>('menu');
  const [branding, setBranding] = useState<QrBranding>(DEFAULT_BRANDING);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);

  const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

  useEffect(() => {
    fetchQrBranding()
      .then(b => {
        setBranding({
          ...DEFAULT_BRANDING,
          ...b,
          themeColors: b.themeColors ?? DEFAULT_THEME_COLORS,
          themeFonts: b.themeFonts ?? DEFAULT_THEME_FONTS,
          cardSettings: b.cardSettings ?? DEFAULT_CARD_SETTINGS,
          schedule: b.schedule ?? DEFAULT_SCHEDULE,
        });
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function handleBrandingChange(updated: QrBranding) {
    setBranding(updated);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveQrBranding(branding);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const accentColor = branding.themeColors?.primary ?? '#8B1A1A';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar — desktop ──────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card py-6">
        <div className="px-4 mb-5">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ChevronLeft size={13} />
            Admin
          </button>
          {/* Module header */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: accentColor }}
            >
              <QrCode size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-none">QR Menú</p>
              <p className="text-xs text-muted-foreground mt-0.5">Carta pública</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id} type="button" onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              style={activeTab === id
                ? { background: `${accentColor}18`, color: accentColor }
                : {}
              }
            >
              <span style={activeTab === id ? { color: accentColor } : {}}>
                <Icon size={16} className={activeTab === id ? '' : 'text-muted-foreground'} />
              </span>
              {label}
            </button>
          ))}
        </nav>

        {/* External links */}
        <div className="px-4 pt-4 border-t border-border space-y-2 mt-2">
          <a
            href={`${BASE}/carta`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Monitor size={12} />
            Ver carta pública ↗
          </a>
          <a
            href={`${BASE}/carta/imprimir`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Printer size={12} />
            Imprimir carta ↗
          </a>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 md:px-6 py-3 flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden p-1.5 rounded-lg hover:bg-secondary cursor-pointer text-muted-foreground"
            onClick={() => setSidebarOpen(v => !v)}
          >
            <LayoutGrid size={18} />
          </button>

          {/* Shield icon + title matching original */}
          <Shield size={16} className="text-muted-foreground hidden md:block" />
          <h1 className="text-base font-semibold text-foreground flex-1 truncate">
            {TABS.find(t => t.id === activeTab)?.label ?? 'QR Menú'}
          </h1>

          {/* Translate button — shown on menu tab */}
          {activeTab === 'menu' && (
            <button
              type="button" onClick={() => setTranslateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <Languages size={14} />
              Traducir menú
            </button>
          )}

          {/* Save button — branding tab */}
          {activeTab === 'branding' && (
            <button
              type="button" onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all cursor-pointer"
              style={{ background: dirty ? accentColor : '#6b7280' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
              {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar'}
            </button>
          )}
        </header>

        {/* Error banner */}
        {error && (
          <div className="mx-4 md:mx-6 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="opacity-60 hover:opacity-100 cursor-pointer ml-2">✕</button>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {activeTab === 'menu' && <TabMenuTree accentColor={accentColor} />}
          {activeTab === 'branding' && (
            <div className="p-4 md:p-6">
              <TabBranding branding={branding} onChange={handleBrandingChange} />
            </div>
          )}
          {activeTab === 'qr' && <TabQRShare />}
          {activeTab === 'export' && <TabExport />}
          {activeTab === 'ajustes' && (
            <div className="p-6 max-w-2xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">Ajustes del módulo</h2>
                <p className="text-sm text-muted-foreground">Configuración general de la carta pública.</p>
              </div>
              {/* Quick navigation links */}
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                <div className="px-4 py-3 bg-secondary/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accesos rápidos</p>
                </div>
                {[
                  { label: 'Ver carta pública',         href: `${BASE}/carta`,          desc: 'Abre la vista del cliente en nueva pestaña', icon: Monitor },
                  { label: 'Imprimir carta',             href: `${BASE}/carta/imprimir`, desc: 'Página de impresión con panel Páginas/Elementos/Colores/Fuentes/Idioma', icon: Printer },
                ].map(({ label, href, desc, icon: Icon }) => (
                  <a
                    key={href} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} className="text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground">↗</span>
                  </a>
                ))}
              </div>
              {/* Module info */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Secciones del módulo</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {['Carta (categorías)', 'Productos', 'Alérgenos (14 EU)', 'Etiquetas dietéticas', 'Diseño & colores', 'Tipografías', 'Horarios', 'Idiomas (8 locales)', 'QR dinámico', 'Publicación', 'Exportar CSV', 'Impresión de carta'].map(s => (
                    <div key={s} className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Mobile sidebar overlay ─────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card py-6 shadow-2xl border-r border-border">
            <div className="px-4 mb-6 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: accentColor }}>
                <QrCode size={15} className="text-white" />
              </div>
              <p className="text-sm font-bold text-foreground">QR Menú</p>
            </div>
            <nav className="px-2 space-y-0.5">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id} type="button"
                  onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all ${
                    activeTab === id ? 'text-foreground' : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  style={activeTab === id ? { background: `${accentColor}18`, color: accentColor } : {}}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
            <div className="px-4 pt-4 mt-4 border-t border-border space-y-2">
              <a href={`${BASE}/carta`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Monitor size={12} />Ver carta ↗
              </a>
              <a href={`${BASE}/carta/imprimir`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Printer size={12} />Imprimir ↗
              </a>
            </div>
          </aside>
        </div>
      )}

      {/* ── Translate dialog ──────────────────────────────────────────── */}
      {translateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl border border-border p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Traducir menú automáticamente</h2>
                <p className="text-xs text-muted-foreground mt-1">Traducción a 8 idiomas con IA</p>
              </div>
              <button type="button" onClick={() => setTranslateOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary cursor-pointer text-muted-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-amber-600 dark:text-amber-400">
              <p className="font-medium mb-1">⚡ Funcionalidad disponible</p>
              <p className="text-xs leading-relaxed">
                Para activar la auto-traducción, configura una integración de OpenAI en el servidor y añade el endpoint
                <code className="bg-amber-500/15 px-1 rounded mx-0.5 text-xs font-mono">POST /api/admin/qr-translate</code>.
                Los textos del menú se traducirán a ES, EN, FR, DE, CA, IT, NL y RO en lotes de 5.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Idiomas destino:</p>
              <div className="flex flex-wrap gap-1.5">
                {['🇪🇸 ES', '🇬🇧 EN', '🇫🇷 FR', '🇩🇪 DE', '🏴 CA', '🇮🇹 IT', '🇳🇱 NL', '🇷🇴 RO'].map(l => (
                  <span key={l} className="px-2 py-0.5 rounded-full text-xs bg-secondary text-foreground font-medium">{l}</span>
                ))}
              </div>
            </div>
            <button
              type="button" onClick={() => setTranslateOpen(false)}
              className="w-full py-2 rounded-xl text-sm font-medium border border-border hover:bg-secondary cursor-pointer transition-colors text-foreground"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
