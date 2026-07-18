/**
 * /admin/qr-menu — Módulo unificado de QR Menú
 * 4 tabs: Menú | Branding | QR & Compartir | Exportar
 * + botón "Traducir menú" en cabecera
 * Fiel a la estructura del programa original (AdminDashboard.tsx)
 */
import { useState, useEffect } from 'react';
import {
  Loader2, Save, Check, LayoutGrid, Palette, QrCode, Download,
  Languages, Monitor, Printer, ExternalLink, X,
} from 'lucide-react';
import type { QrBranding } from './types';
import { DEFAULT_THEME_COLORS, DEFAULT_THEME_FONTS, DEFAULT_CARD_SETTINGS, DEFAULT_SCHEDULE } from './types';
import { fetchQrBranding, saveQrBranding } from './lib';
import TabMenuTree from './TabMenuTree';
import TabBranding from './TabBranding';
import TabQRShare from './TabQRShare';
import TabExport from './TabExport';

type TabId = 'menu' | 'branding' | 'qr' | 'export';

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string; size?: number }> }[] = [
  { id: 'menu',     label: 'Menú',           Icon: LayoutGrid },
  { id: 'branding', label: 'Branding',       Icon: Palette },
  { id: 'qr',       label: 'QR & Compartir', Icon: QrCode },
  { id: 'export',   label: 'Exportar',       Icon: Download },
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
  const [translateOpen, setTranslateOpen] = useState(false);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

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

  const accentColor = branding.themeColors?.accent ?? '#c8963e';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar — desktop ──────────────────────────────────────────────── */}
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
              key={id} type="button" onClick={() => setActiveTab(id)}
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

        {/* Links */}
        <div className="px-4 pt-4 border-t border-gray-100 space-y-2">
          <a
            href={`${BASE}/carta`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Monitor size={12} />
            Ver carta pública ↗
          </a>
          <a
            href={`${BASE}/carta/imprimir`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Printer size={12} />
            Imprimir carta ↗
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
            onClick={() => setSidebarOpen(v => !v)}
          >
            <LayoutGrid size={18} />
          </button>

          <h1 className="text-base font-semibold text-gray-900 flex-1 truncate">
            {TABS.find(t => t.id === activeTab)?.label ?? 'QR Menú'}
          </h1>

          {/* Translate button — shown on menu tab */}
          {activeTab === 'menu' && (
            <button
              type="button" onClick={() => setTranslateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:border-gray-300 text-gray-600 cursor-pointer transition-colors"
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
          {activeTab === 'menu' && <TabMenuTree accentColor={accentColor} />}
          {activeTab === 'branding' && <TabBranding branding={branding} onChange={handleBrandingChange} />}
          {activeTab === 'qr' && <TabQRShare />}
          {activeTab === 'export' && <TabExport />}
        </main>
      </div>

      {/* ── Mobile sidebar overlay ─────────────────────────────────────── */}
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
                  key={id} type="button"
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
            <div className="px-4 pt-4 mt-4 border-t border-gray-100 space-y-2">
              <a href={`${BASE}/carta`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-gray-400">
                <Monitor size={12} />Ver carta ↗
              </a>
              <a href={`${BASE}/carta/imprimir`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-gray-400">
                <Printer size={12} />Imprimir ↗
              </a>
            </div>
          </aside>
        </div>
      )}

      {/* ── Translate dialog ──────────────────────────────────────────── */}
      {translateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Traducir menú automáticamente</h2>
                <p className="text-xs text-gray-500 mt-1">Traducción a 8 idiomas con IA</p>
              </div>
              <button type="button" onClick={() => setTranslateOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
              <p className="font-medium mb-1">⚡ Funcionalidad disponible</p>
              <p className="text-xs leading-relaxed">
                Para activar la auto-traducción, configura una integración de OpenAI en el servidor y añade el endpoint
                <code className="bg-amber-100 px-1 rounded mx-0.5 text-xs font-mono">POST /api/admin/qr-translate</code>.
                Los textos del menú se traducirán a ES, EN, FR, DE, CA, IT, NL y RO en lotes de 5.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-600">Idiomas destino:</p>
              <div className="flex flex-wrap gap-1.5">
                {['🇪🇸 ES', '🇬🇧 EN', '🇫🇷 FR', '🇩🇪 DE', '🏴 CA', '🇮🇹 IT', '🇳🇱 NL', '🇷🇴 RO'].map(l => (
                  <span key={l} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-medium">{l}</span>
                ))}
              </div>
            </div>
            <button
              type="button" onClick={() => setTranslateOpen(false)}
              className="w-full py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
