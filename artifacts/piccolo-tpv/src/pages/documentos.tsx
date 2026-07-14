import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, Save, FileText, Printer, Clock, Building2,
  Plus, Pencil, Copy, Trash2, Check, X, Star, Loader2,
  ChevronDown, ChevronRight, Settings, Shield,
  AlignLeft, AlignCenter, AlignRight, RefreshCw,
} from 'lucide-react';
import {
  useGetBusinessConfig,
  useUpdateBusinessConfig,
  useGetDocumentTemplates,
  useCreateDocumentTemplate,
  useUpdateDocumentTemplate,
  useActivateDocumentTemplate,
  useDuplicateDocumentTemplate,
  useDeleteDocumentTemplate,
  useGetPrinterConfigs,
  useCreatePrinterConfig,
  useUpdatePrinterConfig,
  useDeletePrinterConfig,
  useGetDocumentAuditLog,
  getGetBusinessConfigQueryKey,
  getGetDocumentTemplatesQueryKey,
  getGetPrinterConfigsQueryKey,
  getGetDocumentAuditLogQueryKey,
  type BusinessConfig,
  type DocumentTemplate,
  type PrinterConfig,
  type DocumentAuditEntry,
} from '@workspace/api-client-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'establecimiento' | 'plantillas' | 'impresoras' | 'auditoria';
type DocTypeFilter = 'all' | 'ticket' | 'prefactura' | 'factura_completa' | 'comanda' | 'recogida';
type PrintFormat = 'thermal_80mm' | 'thermal_58mm' | 'a4' | 'a5' | 'digital';

interface TemplateConfig {
  fontFamily?: string;
  fontSize?: number;
  headerAlign?: 'left' | 'center' | 'right';
  showLogo?: boolean;
  logoSize?: 'small' | 'medium' | 'large';
  showWeb?: boolean;
  showPhone?: boolean;
  showEmail?: boolean;
  marginTop?: number;
  marginBottom?: number;
  separatorChar?: string;
  headerText?: string;
  footerText?: string;
  showQrCommercial?: boolean;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  prefactura: 'Prefactura',
  factura_completa: 'Factura completa',
  comanda: 'Comanda cocina',
  recogida: 'Ticket reparto',
};

const FORMAT_LABELS: Record<string, string> = {
  thermal_80mm: 'Térmica 80mm',
  thermal_58mm: 'Térmica 58mm',
  a4: 'A4',
  a5: 'A5',
  digital: 'Digital',
};

const FORMAT_WIDTHS: Record<PrintFormat, number> = {
  thermal_80mm: 302,
  thermal_58mm: 219,
  a4: 420,
  a5: 300,
  digital: 320,
};

const SEP_CHARS = [
  { label: '— Guion', value: '-' },
  { label: '═ Doble', value: '=' },
  { label: '· Punto', value: '·' },
  { label: '~ Tilde', value: '~' },
  { label: '  Espacio', value: ' ' },
];

// ─── Document Preview ──────────────────────────────────────────────────────────
interface PreviewProps {
  config: TemplateConfig;
  format: PrintFormat;
  businessName: string;
  docType: string;
  businessConfig?: BusinessConfig | null;
}

function DocumentPreview({ config, format, businessName, docType, businessConfig }: PreviewProps) {
  const w = FORMAT_WIDTHS[format] ?? 302;
  const isThermal = format.startsWith('thermal');
  const isA4 = format === 'a4' || format === 'a5';
  const sep = (config.separatorChar ?? '-').repeat(isThermal ? Math.floor(w / 8) : 60);
  const align = config.headerAlign ?? 'center';
  const font = config.fontFamily === 'sans-serif' ? 'Arial, sans-serif'
    : config.fontFamily === 'serif' ? 'Georgia, serif'
    : '"Courier New", Courier, monospace';
  const fs = config.fontSize ?? 14;
  const mt = config.marginTop ?? 4;
  const mb = config.marginBottom ?? 4;
  const isComanda = docType === 'comanda';
  const isPrefactura = docType === 'prefactura';

  const sampleItems = isComanda
    ? [{ q: 2, name: 'Ensalada mediterránea' }, { q: 1, name: 'Chuletón al punto' }, { q: 3, name: 'Patatas fritas' }]
    : [{ q: 2, name: 'Ensalada mixta', price: '7.90' }, { q: 1, name: 'Chuletón de buey', price: '28.50' }, { q: 3, name: 'Cerveza Moritz', price: '2.80' }];

  return (
    <div
      style={{ width: w, fontFamily: font, fontSize: fs, paddingTop: mt * 2, paddingBottom: mb * 2, background: '#fff', color: '#111', lineHeight: 1.35 }}
      className="shadow-2xl mx-auto overflow-hidden rounded-sm"
    >
      {/* Logo placeholder */}
      {config.showLogo && (
        <div className={`flex ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'} mb-1 px-2`}>
          <div className={`bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs font-bold ${config.logoSize === 'large' ? 'h-10 w-24' : config.logoSize === 'small' ? 'h-5 w-14' : 'h-7 w-18'}`}>
            LOGO
          </div>
        </div>
      )}

      {/* Business name */}
      <div style={{ textAlign: align, fontWeight: 900, fontSize: fs + (isComanda ? 6 : 2), padding: '0 8px 4px', letterSpacing: 2 }}>
        {config.headerText || businessName || 'Piccolo'}
      </div>

      {/* NIF / address — locked mandatory field */}
      <div style={{ textAlign: align, fontSize: fs - 3, padding: '0 8px 2px', color: '#444' }}>
        {businessConfig?.nif || 'NIF: B12345678'} · {businessConfig?.poblacion || 'La Ràpita'}
      </div>
      {config.showPhone && businessConfig?.telefono && (
        <div style={{ textAlign: align, fontSize: fs - 3, padding: '0 8px', color: '#444' }}>Tel: {businessConfig.telefono}</div>
      )}
      {config.showWeb && businessConfig?.web && (
        <div style={{ textAlign: align, fontSize: fs - 3, padding: '0 8px 2px', color: '#444' }}>{businessConfig.web}</div>
      )}
      {config.showEmail && businessConfig?.email && (
        <div style={{ textAlign: align, fontSize: fs - 3, padding: '0 8px 2px', color: '#444' }}>{businessConfig.email}</div>
      )}

      {/* Separator */}
      <div style={{ padding: '4px 8px', overflow: 'hidden', color: '#888', fontSize: fs - 3, letterSpacing: 0 }}>{sep}</div>

      {/* Prefactura disclaimer */}
      {isPrefactura && (
        <div style={{ margin: '4px 8px', border: '1px dashed #b45309', padding: '4px', textAlign: 'center', background: '#fffbeb' }}>
          <div style={{ fontWeight: 900, fontSize: fs + 2, color: '#92400e', letterSpacing: 2 }}>PREFACTURA</div>
          <div style={{ fontSize: fs - 4, color: '#92400e', fontWeight: 700 }}>NO VÁLIDA COMO FACTURA FISCAL</div>
        </div>
      )}

      {/* Mandatory meta */}
      <div style={{ padding: '2px 8px', fontSize: fs - 2 }}>
        <div>Mesa: Terraza 3</div>
        <div>Fecha: {new Date().toLocaleDateString('es-ES')}</div>
        {!isComanda && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Serie/Nº:</span><span>T-0042</span></div>}
      </div>

      <div style={{ padding: '2px 8px', overflow: 'hidden', color: '#888', fontSize: fs - 3 }}>{sep}</div>

      {/* Items */}
      <div style={{ padding: '2px 8px', fontSize: fs - 1 }}>
        {sampleItems.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ flex: 1 }}>{it.q}× {it.name}</span>
            {'price' in it && <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{(parseFloat((it as any).price) * it.q).toFixed(2)}€</span>}
          </div>
        ))}
      </div>

      {!isComanda && (
        <>
          <div style={{ padding: '2px 8px', overflow: 'hidden', color: '#888', fontSize: fs - 3 }}>{sep}</div>
          {/* Locked totals */}
          <div style={{ padding: '2px 8px', fontSize: fs - 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>43.40€</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IVA 10%</span><span>4.34€</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: fs + 2, marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc' }}>
              <span>TOTAL</span><span>47.74€</span>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      {config.footerText && (
        <>
          <div style={{ padding: '2px 8px', overflow: 'hidden', color: '#888', fontSize: fs - 3 }}>{sep}</div>
          <div style={{ textAlign: align, padding: '4px 8px', fontSize: fs - 2, color: '#444' }}>
            {config.footerText}
          </div>
        </>
      )}

      {/* QR placeholder */}
      {config.showQrCommercial && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px' }}>
          <div style={{ width: 60, height: 60, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#9ca3af', fontWeight: 700 }}>
            QR
          </div>
        </div>
      )}

      <div style={{ paddingBottom: mb * 2 }} />
    </div>
  );
}

// ─── Accordion section ─────────────────────────────────────────────────────────
function AccordionSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/60 transition-colors"
      >
        <span className="font-bold text-sm uppercase tracking-widest text-muted-foreground">{title}</span>
        {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-3 bg-card">{children}</div>}
    </div>
  );
}

// ─── Locked field indicator ────────────────────────────────────────────────────
function LockedField({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-secondary/20 rounded-lg opacity-60">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Shield size={12} />
        <span className="text-xs font-bold">Obligatorio</span>
      </div>
    </div>
  );
}

// ─── Template Editor ───────────────────────────────────────────────────────────
interface TemplateEditorProps {
  template: DocumentTemplate;
  businessConfig: BusinessConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

function TemplateEditor({ template, businessConfig, onClose, onSaved }: TemplateEditorProps) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<TemplateConfig>((template.config as TemplateConfig) ?? {});
  const [format, setFormat] = useState<PrintFormat>((template.printFormat as PrintFormat) ?? 'thermal_80mm');
  const [saving, setSaving] = useState(false);
  const updateTemplate = useUpdateDocumentTemplate();

  const set = (key: keyof TemplateConfig, value: unknown) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTemplate.mutateAsync({ id: template.id, data: { printFormat: format, config: config as Record<string, unknown> } });
      queryClient.invalidateQueries({ queryKey: getGetDocumentTemplatesQueryKey() });
      toast.success('Plantilla guardada');
      onSaved();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center px-4 border-b border-border bg-card shrink-0 gap-3">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-base truncate leading-none">Editor: {template.name}</h2>
          <span className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[template.documentType] ?? template.documentType}</span>
        </div>
        {/* Format selector */}
        <select
          value={format}
          onChange={e => setFormat(e.target.value as PrintFormat)}
          className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {Object.entries(FORMAT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm active:scale-95 disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
      </header>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: settings */}
        <div className="w-80 xl:w-96 shrink-0 border-r border-border overflow-y-auto bg-background p-3 space-y-3">
          <AccordionSection title="Logo y cabecera">
            <label className="flex items-center justify-between">
              <span className="text-sm font-semibold">Mostrar logo</span>
              <button
                onClick={() => set('showLogo', !config.showLogo)}
                className={`w-11 h-6 rounded-full transition-colors ${config.showLogo ? 'bg-primary' : 'bg-secondary'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${config.showLogo ? 'translate-x-5' : ''}`} />
              </button>
            </label>
            {config.showLogo && (
              <div>
                <label className="text-xs text-muted-foreground font-bold mb-1 block">Tamaño del logo</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map(s => (
                    <button key={s} onClick={() => set('logoSize', s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${config.logoSize === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                      {s === 'small' ? 'Pequeño' : s === 'medium' ? 'Mediano' : 'Grande'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Alineación</label>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map(a => (
                  <button key={a} onClick={() => set('headerAlign', a)}
                    className={`flex-1 h-9 flex items-center justify-center rounded-lg border transition-colors ${config.headerAlign === a ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    {a === 'left' ? <AlignLeft size={14} /> : a === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Texto cabecera</label>
              <input
                value={config.headerText ?? ''}
                onChange={e => set('headerText', e.target.value)}
                placeholder="Dejar vacío para usar el nombre comercial"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </AccordionSection>

          <AccordionSection title="Tipografía">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Familia tipográfica</label>
              <div className="flex flex-col gap-1.5">
                {[
                  { v: 'monospace', l: 'Monospace (térmica clásica)' },
                  { v: 'sans-serif', l: 'Sans-serif (moderna)' },
                  { v: 'serif', l: 'Serif (clásica)' },
                ].map(({ v, l }) => (
                  <button key={v} onClick={() => set('fontFamily', v)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left ${config.fontFamily === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${config.fontFamily === v ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`} />
                    <span style={{ fontFamily: v }}>{l}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Tamaño fuente: {config.fontSize ?? 14}px</label>
              <input type="range" min={10} max={20} value={config.fontSize ?? 14} onChange={e => set('fontSize', parseInt(e.target.value))}
                className="w-full accent-primary" />
            </div>
          </AccordionSection>

          <AccordionSection title="Márgenes y separadores">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-bold mb-1 block">Margen superior: {config.marginTop ?? 4}mm</label>
                <input type="range" min={0} max={12} value={config.marginTop ?? 4} onChange={e => set('marginTop', parseInt(e.target.value))}
                  className="w-full accent-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-bold mb-1 block">Margen inferior: {config.marginBottom ?? 4}mm</label>
                <input type="range" min={0} max={12} value={config.marginBottom ?? 4} onChange={e => set('marginBottom', parseInt(e.target.value))}
                  className="w-full accent-primary" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Carácter separador</label>
              <div className="flex flex-wrap gap-1.5">
                {SEP_CHARS.map(({ label, value }) => (
                  <button key={value} onClick={() => set('separatorChar', value)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-colors ${config.separatorChar === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="Pie de página">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Texto de cierre</label>
              <input
                value={config.footerText ?? ''}
                onChange={e => set('footerText', e.target.value)}
                placeholder="¡Gracias por su visita!"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </AccordionSection>

          <AccordionSection title="Campos visibles">
            {[
              { key: 'showPhone', label: 'Teléfono' },
              { key: 'showWeb', label: 'Página web' },
              { key: 'showEmail', label: 'Email' },
              { key: 'showQrCommercial', label: 'QR comercial' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between">
                <span className="text-sm font-semibold">{label}</span>
                <button
                  onClick={() => set(key as keyof TemplateConfig, !(config as any)[key])}
                  className={`w-11 h-6 rounded-full transition-colors ${(config as any)[key] ? 'bg-primary' : 'bg-secondary'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${(config as any)[key] ? 'translate-x-5' : ''}`} />
                </button>
              </label>
            ))}
          </AccordionSection>

          <AccordionSection title="Campos fiscales obligatorios" defaultOpen={false}>
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">Estos campos son obligatorios por normativa fiscal española y no pueden ocultarse.</p>
            {['NIF/CIF emisor', 'Razón social', 'Fecha de expedición', 'Serie y número', 'Base imponible', 'IVA (tipo y cuota)', 'Total'].map(f => (
              <LockedField key={f} label={f} />
            ))}
          </AccordionSection>
        </div>

        {/* Right: preview */}
        <div className="flex-1 overflow-y-auto bg-muted/20 p-6 flex flex-col items-center gap-4">
          <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">
            Vista previa — {FORMAT_LABELS[format]}
          </div>
          <DocumentPreview
            config={config}
            format={format}
            businessName={businessConfig?.nombreComercial ?? 'Piccolo'}
            docType={template.documentType}
            businessConfig={businessConfig}
          />
          <div className="text-xs text-muted-foreground/50 mt-4 text-center leading-relaxed">
            Vista previa con datos de muestra.<br />Los datos reales se usan en documentos generados.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Establecimiento tab ───────────────────────────────────────────────────────
function EstablecimientoTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetBusinessConfig({
    query: { queryKey: getGetBusinessConfigQueryKey() },
  });
  const update = useUpdateBusinessConfig();
  const [form, setForm] = useState<Partial<BusinessConfig>>({});
  const [saving, setSaving] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    if (data && !initialised.current) {
      initialised.current = true;
      setForm(data);
    }
  }, [data]);

  const setF = (k: keyof BusinessConfig, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await update.mutateAsync({ data: form as BusinessConfig });
      qc.invalidateQueries({ queryKey: getGetBusinessConfigQueryKey() });
      initialised.current = false;
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  const fields: { key: keyof BusinessConfig; label: string; placeholder: string; span?: boolean }[] = [
    { key: 'nombreComercial', label: 'Nombre comercial', placeholder: 'Piccolo La Ràpita' },
    { key: 'razonSocial', label: 'Razón social', placeholder: 'Piccolo La Ràpita S.L.' },
    { key: 'nif', label: 'NIF / CIF', placeholder: 'B12345678' },
    { key: 'direccionFiscal', label: 'Dirección fiscal', placeholder: 'Av. Constitució 12', span: true },
    { key: 'codigoPostal', label: 'Código postal', placeholder: '43580' },
    { key: 'poblacion', label: 'Población', placeholder: 'La Ràpita' },
    { key: 'provincia', label: 'Provincia', placeholder: 'Tarragona' },
    { key: 'pais', label: 'País', placeholder: 'España' },
    { key: 'telefono', label: 'Teléfono', placeholder: '977 630 000' },
    { key: 'email', label: 'Email', placeholder: 'info@piccolo.es' },
    { key: 'web', label: 'Página web', placeholder: 'piccolo.es' },
    { key: 'logoUrl', label: 'URL del logotipo', placeholder: 'https://…/logo.png', span: true },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="font-black text-lg leading-none">Datos del establecimiento</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Aparecen en todos los documentos fiscales emitidos</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {fields.map(({ key, label, placeholder, span }) => (
            <div key={key} className={span ? 'col-span-2' : ''}>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</label>
              <input
                value={(form[key] as string) ?? ''}
                onChange={e => setF(key, e.target.value)}
                placeholder={placeholder}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-black rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cambios
          </button>
        </div>
      </div>

      <div className="mt-4 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400/80 leading-relaxed">
        <span className="font-black">Nota fiscal:</span> La razón social, NIF y dirección se imprimen automáticamente en tickets y facturas.
        El campo "Nombre comercial" aparece en la cabecera de documentos. Actualizar estos datos no modifica documentos ya emitidos.
      </div>
    </div>
  );
}

// ─── Plantillas tab ─────────────────────────────────────────────────────────────
interface PlantillasTabProps {
  onEdit: (t: DocumentTemplate) => void;
  businessConfig: BusinessConfig | null;
}

function PlantillasTab({ onEdit }: PlantillasTabProps) {
  const qc = useQueryClient();
  const [docType, setDocType] = useState<DocTypeFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('ticket');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const params = docType === 'all' ? {} : { documentType: docType };
  const { data: templates = [], isLoading } = useGetDocumentTemplates(params, {
    query: { queryKey: getGetDocumentTemplatesQueryKey(params) },
  });

  const createTemplate = useCreateDocumentTemplate();
  const activateTemplate = useActivateDocumentTemplate();
  const duplicateTemplate = useDuplicateDocumentTemplate();
  const deleteTemplate = useDeleteDocumentTemplate();

  const handleActivate = async (id: string) => {
    try {
      await activateTemplate.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getGetDocumentTemplatesQueryKey() });
      toast.success('Plantilla activada');
    } catch { toast.error('Error'); }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateTemplate.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getGetDocumentTemplatesQueryKey() });
      toast.success('Plantilla duplicada');
    } catch { toast.error('Error al duplicar'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getGetDocumentTemplatesQueryKey() });
      setDeletingId(null);
      toast.success('Plantilla eliminada');
    } catch (e: any) {
      toast.error(e?.message?.includes('default') ? 'No se puede eliminar la plantilla activa' : 'Error al eliminar');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createTemplate.mutateAsync({ data: { name: newName.trim(), documentType: newType } });
      qc.invalidateQueries({ queryKey: getGetDocumentTemplatesQueryKey() });
      setShowCreate(false);
      setNewName('');
      toast.success('Plantilla creada');
    } catch { toast.error('Error al crear'); }
  };

  const docTypes: DocTypeFilter[] = ['all', 'ticket', 'prefactura', 'factura_completa', 'comanda', 'recogida'];

  return (
    <div>
      {/* Filter + create */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {docTypes.map(t => (
            <button key={t} onClick={() => setDocType(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${docType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
              {t === 'all' ? 'Todos' : DOC_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm active:scale-95">
          <Plus size={14} /> Nueva plantilla
        </button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="bg-card border border-primary/30 rounded-2xl p-5 mb-5 shadow-lg">
          <h3 className="font-black mb-4">Nueva plantilla</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Nombre</label>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Mi plantilla personalizada"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Tipo de documento</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-secondary rounded-xl font-bold text-sm">Cancelar</button>
            <button onClick={handleCreate} disabled={!newName.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50">Crear</button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">No hay plantillas para este tipo</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map(t => (
            <div key={t.id} className={`bg-card border rounded-2xl p-4 shadow-sm transition-all ${t.isDefault ? 'border-primary/40 shadow-primary/10' : 'border-border'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-base">{t.name}</span>
                    {t.isDefault && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                        <Star size={9} /> Activa
                      </span>
                    )}
                    {t.isBuiltIn && (
                      <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Predeterminada</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground font-semibold">{DOC_TYPE_LABELS[t.documentType] ?? t.documentType}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground">{FORMAT_LABELS[t.printFormat as PrintFormat] ?? t.printFormat}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!t.isDefault && (
                    <button onClick={() => handleActivate(t.id)} title="Establecer como activa"
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95">
                      <Star size={13} />
                    </button>
                  )}
                  <button onClick={() => handleDuplicate(t.id)} title="Duplicar"
                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors active:scale-95">
                    <Copy size={13} />
                  </button>
                  <button onClick={() => onEdit(t)} title="Editar"
                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95">
                    <Pencil size={13} />
                  </button>
                  {!t.isDefault && (
                    deletingId === t.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(t.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-destructive text-destructive-foreground active:scale-95 text-xs font-black">
                          <Check size={13} />
                        </button>
                        <button onClick={() => setDeletingId(null)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary active:scale-95">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeletingId(t.id)} title="Eliminar"
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors active:scale-95">
                        <Trash2 size={13} />
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Impresoras tab ────────────────────────────────────────────────────────────
function ImprésorasTab() {
  const qc = useQueryClient();
  const { data: printers = [], isLoading } = useGetPrinterConfigs({
    query: { queryKey: getGetPrinterConfigsQueryKey() },
  });
  const createPrinter = useCreatePrinterConfig();
  const updatePrinter = useUpdatePrinterConfig();
  const deletePrinter = useDeletePrinterConfig();

  const [editing, setEditing] = useState<Partial<PrinterConfig> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const emptyForm = (): Partial<PrinterConfig> => ({
    name: '', printerType: 'thermal', paperWidth: 80, location: 'Caja',
    documentType: 'ticket', copies: 1, autoCut: true, cashDrawer: false, autoPrint: false,
  });

  const handleSave = async () => {
    if (!editing?.name?.trim()) return;
    setSaving(true);
    try {
      if (editing.id) {
        await updatePrinter.mutateAsync({ id: editing.id, data: editing as any });
      } else {
        await createPrinter.mutateAsync({ data: editing as any });
      }
      qc.invalidateQueries({ queryKey: getGetPrinterConfigsQueryKey() });
      setEditing(null);
      toast.success(editing.id ? 'Impresora actualizada' : 'Impresora añadida');
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePrinter.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getGetPrinterConfigsQueryKey() });
      setDeletingId(null);
      toast.success('Impresora eliminada');
    } catch { toast.error('Error al eliminar'); }
  };

  const handleTestPrint = (printer: PrinterConfig) => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`
      <html><head><title>Prueba impresora</title>
      <style>
        body { font-family: "Courier New", monospace; font-size: 14px; width: ${printer.paperWidth}mm; margin: 0 auto; padding: 8px; }
        .center { text-align: center; }
        .sep { border-top: 1px dashed #000; margin: 8px 0; }
        .watermark { border: 2px dashed #000; padding: 6px; text-align: center; margin: 8px 0; }
      </style>
      </head><body onload="window.print();window.close()">
      <div class="center"><strong style="font-size:18px">*** PRUEBA ***</strong></div>
      <div class="sep"></div>
      <div class="watermark">
        <div style="font-weight:900;font-size:13px">DOCUMENTO DE PRUEBA</div>
        <div style="font-size:10px">SIN VALIDEZ FISCAL</div>
      </div>
      <div class="sep"></div>
      <div>Impresora: ${printer.name}</div>
      <div>Ubicación: ${printer.location}</div>
      <div>Papel: ${printer.paperWidth}mm</div>
      <div>Copias: ${printer.copies}</div>
      <div class="sep"></div>
      <div class="center">${new Date().toLocaleString('es-ES')}</div>
      </body></html>`);
    w.document.close();
    toast.success(`Imprimiendo prueba en ${printer.name}`);
  };

  const setE = (k: keyof PrinterConfig, v: any) => setEditing(p => p ? { ...p, [k]: v } : null);

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <div className="flex justify-end mb-5">
        <button onClick={() => setEditing(emptyForm())}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm active:scale-95">
          <Plus size={14} /> Añadir impresora
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-card border border-primary/30 rounded-2xl p-5 mb-5 shadow-lg">
          <h3 className="font-black mb-4">{editing.id ? 'Editar impresora' : 'Nueva impresora'}</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {([
              { k: 'name', l: 'Nombre', ph: 'Epson TM-T20' },
              { k: 'location', l: 'Ubicación', ph: 'Caja, Cocina, Barra…' },
            ] as const).map(({ k, l, ph }) => (
              <div key={k}>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">{l}</label>
                <input value={(editing as any)[k] ?? ''} onChange={e => setE(k as any, e.target.value)} placeholder={ph}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            ))}
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Tipo</label>
              <select value={editing.printerType ?? 'thermal'} onChange={e => setE('printerType', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="thermal">Térmica</option>
                <option value="laser">Láser / Tinta</option>
                <option value="pdf">PDF (virtual)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Ancho papel (mm)</label>
              <select value={editing.paperWidth ?? 80} onChange={e => setE('paperWidth', parseInt(e.target.value))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value={58}>58mm</option>
                <option value={80}>80mm</option>
                <option value={210}>A4 (210mm)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Documento asignado</label>
              <select value={editing.documentType ?? 'ticket'} onChange={e => setE('documentType', e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Copias</label>
              <input type="number" min={1} max={5} value={editing.copies ?? 1} onChange={e => setE('copies', parseInt(e.target.value))}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-4 mb-4">
            {([
              { k: 'autoCut', l: 'Corte automático' },
              { k: 'cashDrawer', l: 'Abrir cajón' },
              { k: 'autoPrint', l: 'Imprimir automático' },
            ] as const).map(({ k, l }) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer select-none">
                <button onClick={() => setE(k, !(editing as any)[k])}
                  className={`w-10 h-5 rounded-full transition-colors ${(editing as any)[k] ? 'bg-primary' : 'bg-secondary'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${(editing as any)[k] ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm font-semibold">{l}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditing(null)} className="px-4 py-2 bg-secondary rounded-xl font-bold text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !editing.name?.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {printers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Printer size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">No hay impresoras configuradas</p>
          <p className="text-sm mt-1">Añade una para gestionar la impresión de documentos</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {printers.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Printer size={16} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black">{p.name}</span>
                  {!p.active && <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-full">Inactiva</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                  <span>{p.printerType === 'thermal' ? 'Térmica' : p.printerType}</span>
                  <span>·</span>
                  <span>{p.paperWidth}mm</span>
                  <span>·</span>
                  <span>{p.location}</span>
                  <span>·</span>
                  <span>{DOC_TYPE_LABELS[p.documentType] ?? p.documentType}</span>
                  {p.copies > 1 && <><span>·</span><span>{p.copies} copias</span></>}
                </div>
                <div className="flex gap-2 mt-1 text-xs text-muted-foreground/60">
                  {p.autoCut && <span>Corte ✓</span>}
                  {p.cashDrawer && <span>Cajón ✓</span>}
                  {p.autoPrint && <span>Auto ✓</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => handleTestPrint(p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary border border-border text-xs font-bold transition-colors active:scale-95">
                  <Printer size={12} /> Prueba
                </button>
                <button onClick={() => setEditing(p)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors active:scale-95">
                  <Pencil size={13} />
                </button>
                {deletingId === p.id ? (
                  <div className="flex gap-1">
                    <button onClick={() => handleDelete(p.id)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-destructive text-destructive-foreground active:scale-95">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setDeletingId(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary active:scale-95">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeletingId(p.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors active:scale-95">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Auditoría tab ─────────────────────────────────────────────────────────────
function AuditoriaTab() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const params = { page, limit };
  const { data, isLoading } = useGetDocumentAuditLog(params, {
    query: { queryKey: getGetDocumentAuditLogQueryKey(params) },
  });

  const rows: DocumentAuditEntry[] = data?.rows ?? [];

  const ACTION_LABELS: Record<string, string> = {
    issue_ticket: 'Ticket emitido',
    issue_invoice: 'Factura emitida',
    reprint_ticket: 'Reimpresión ticket',
    reprint_invoice: 'Reimpresión factura',
    activate_template: 'Plantilla activada',
    create_template: 'Plantilla creada',
    update_template: 'Plantilla actualizada',
    delete_template: 'Plantilla eliminada',
    unauthorized_attempt: 'Intento no autorizado',
    print_prefactura: 'Prefactura impresa',
  };

  const ACTION_COLORS: Record<string, string> = {
    issue_ticket: 'text-green-400',
    issue_invoice: 'text-primary',
    reprint_ticket: 'text-amber-400',
    reprint_invoice: 'text-amber-400',
    unauthorized_attempt: 'text-destructive',
    print_prefactura: 'text-blue-400',
  };

  return (
    <div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Clock size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold">Sin actividad registrada</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Acción</th>
                <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Empleado</th>
                <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">Importe</th>
                <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 0 ? '' : 'bg-secondary/10'}`}>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${ACTION_COLORS[r.action] ?? 'text-foreground'}`}>
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                    <div className="text-xs text-muted-foreground mt-0.5">{DOC_TYPE_LABELS[r.documentType] ?? r.documentType}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {r.employeeName || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground hidden md:table-cell">
                    {r.amount ? `${parseFloat(r.amount).toFixed(2)}€` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(data?.rows?.length === limit || page > 1) && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 bg-secondary rounded-xl font-bold text-sm disabled:opacity-40">← Anterior</button>
          <span className="text-sm font-bold text-muted-foreground">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(data?.rows?.length ?? 0) < limit}
            className="px-4 py-2 bg-secondary rounded-xl font-bold text-sm disabled:opacity-40">Siguiente →</button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Documentos() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('establecimiento');
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);

  // Admin guard
  useEffect(() => {
    const empStr = localStorage.getItem('employee');
    if (!empStr) { setLocation('/'); return; }
    try {
      const emp = JSON.parse(empStr);
      if (emp.role !== 'admin') setLocation('/tables');
    } catch { setLocation('/'); }
  }, [setLocation]);

  const { data: businessConfig = null } = useGetBusinessConfig({
    query: { queryKey: getGetBusinessConfigQueryKey() },
  });

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'establecimiento', label: 'Establecimiento', icon: <Building2 size={14} /> },
    { id: 'plantillas', label: 'Plantillas', icon: <FileText size={14} /> },
    { id: 'impresoras', label: 'Impresoras', icon: <Printer size={14} /> },
    { id: 'auditoria', label: 'Historial', icon: <Clock size={14} /> },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Template editor overlay */}
      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          businessConfig={businessConfig}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => setEditingTemplate(null)}
        />
      )}

      {/* Header */}
      <header className="h-16 flex items-center px-4 border-b border-border bg-card shrink-0 shadow-sm gap-3">
        <button onClick={() => setLocation('/configuracion')}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors active:scale-95 border border-transparent hover:border-border">
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black leading-none truncate">Documentos e Impresión</h1>
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Administración</span>
        </div>
        <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black">
          <Shield size={11} /> Solo admin
        </span>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-card shrink-0">
        <div className="flex gap-1 px-4 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {activeTab === 'establecimiento' && <EstablecimientoTab />}
        {activeTab === 'plantillas' && (
          <PlantillasTab onEdit={setEditingTemplate} businessConfig={businessConfig} />
        )}
        {activeTab === 'impresoras' && <ImprésorasTab />}
        {activeTab === 'auditoria' && <AuditoriaTab />}
      </div>
    </div>
  );
}
