/**
 * /admin/qr-menu — Módulo unificado de QR Menú
 * 7 tabs: Carta | Branding | Horarios | Idiomas | QR & Compartir | Vista previa | Impresión
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, Check, LayoutGrid, Palette, Clock, Globe, QrCode, Monitor, Printer } from 'lucide-react';
import type { QrBranding } from './types';
import { DEFAULT_THEME_COLORS, DEFAULT_THEME_FONTS, DEFAULT_CARD_SETTINGS, DEFAULT_SCHEDULE } from './types';
import { fetchQrBranding, saveQrBranding } from './lib';
import TabMenuTree from './TabMenuTree';
import TabBranding from './TabBranding';
import TabSchedule from './TabSchedule';
import TabIdiomas from './TabIdiomas';
import TabQRShare from './TabQRShare';
import TabPreview from './TabPreview';
import TabPrint from './TabPrint';

type TabId = 'menu' | 'branding' | 'schedule' | 'idiomas' | 'qr' | 'preview' | 'print';

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string; size?: number }> }[] = [
  { id: 'menu',     label: 'Carta',          Icon: LayoutGrid },
  { id: 'branding', label: 'Branding',        Icon: Palette },
  { id: 'schedule', label: 'Horarios',        Icon: Clock },
  { id: 'idiomas',  label: 'Idiomas',         Icon: Globe },
  { id: 'qr',       label: 'QR & Compartir', Icon: QrCode },
  { id: 'preview',  label: 'Vista previa',   Icon: Monitor },
  { id: 'print',    label: 'Impresión',       Icon: Printer },
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
  const [activeTab, setActiveTab] = useState<TabId>('menu');
  const [branding, setBranding] = useState<QrBranding>(DEFAULT_BRANDING);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchQrBranding()
      .then((b) => {
        setBranding({
          ...DEFAULT_BRANDING,
          ...b,
          themeColors: b.themeColors ?? DEFAULT_THEME_COLORS,
          themeFonts: b.themeFonts ?? DEFAULT_THEME_FONTS,
          cardSettings: b.cardSettings ?? DEFAULT_CARD_SETTINGS,
          schedule: b.schedule ?? DEFAULT_SCHEDULE,
        });
      })
      .catch((e) => setError(String(e)))
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

  const accentColor = branding.themeColors?.accent ?? '#c8963e';

  const tabContent = {
    menu: <TabMenuTree accentColor={accentColor} />,
    branding: <TabBranding branding={branding} onChange={handleBrandingChange} />,
    schedule: (
      <TabSchedule
        schedule={branding.schedule ?? DEFAULT_SCHEDULE}
        onChange={(s) => handleBrandingChange({ ...branding, schedule: s })}
      />
    ),
    idiomas: <TabIdiomas />,
    qr: <TabQRShare />,
    preview: <TabPreview />,
    print: <TabPrint />,
  };

  const branding_tabs: TabId[] = ['branding', 'schedule'];
  const needsSave = branding_tabs.includes(activeTab) || activeTab === 'schedule';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar — desktop ───────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-gray-200 bg-white py-6">
        <div className="px-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: accentColor }}>
              <QrCode size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">QR Menú</p>
              <p className="text-xs text-gray-400">Carta pública</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === id
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={16} className={activeTab === id ? 'text-gray-700' : 'text-gray-400'} />
              {label}
            </button>
          ))}
        </nav>
        {/* Link to public carta */}
        <div className="px-4 pt-4 border-t border-gray-100">
          <a
            href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/carta`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Monitor size={12} />
            Ver carta pública ↗
          </a>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <LayoutGrid size={18} />
          </button>

          <h1 className="text-base font-semibold text-gray-900 flex-1 truncate">
            {TABS.find((t) => t.id === activeTab)?.label ?? 'QR Menú'}
          </h1>

          {/* Save button (only for branding/schedule tabs) */}
          {(activeTab === 'branding' || activeTab === 'schedule') && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all cursor-pointer"
              style={{ background: dirty ? '#1a1a1a' : '#9ca3af' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
              {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar'}
            </button>
          )}
        </header>

        {/* Error banner */}
        {error && (
          <div className="mx-4 md:mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600 cursor-pointer ml-2">✕</button>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {tabContent[activeTab]}
        </main>
      </div>

      {/* ── Mobile sidebar overlay ────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white py-6 shadow-xl">
            <div className="px-4 mb-6">
              <p className="text-sm font-bold text-gray-900">QR Menú</p>
            </div>
            <nav className="px-2 space-y-0.5">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${
                    activeTab === id ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
