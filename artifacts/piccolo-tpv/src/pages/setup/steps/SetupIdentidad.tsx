import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

interface BusinessConfig {
  nombreComercial: string;
  razonSocial: string;
  nif: string;
  direccionFiscal: string;
  codigoPostal: string;
  poblacion: string;
  provincia: string;
  pais: string;
  telefono: string;
  email: string;
  web: string;
  logoUrl: string;
  tagline: string;
  moneda: string;
  idioma: string;
}

const EMPTY: BusinessConfig = {
  nombreComercial: '', razonSocial: '', nif: '', direccionFiscal: '',
  codigoPostal: '', poblacion: '', provincia: '', pais: 'España',
  telefono: '', email: '', web: '', logoUrl: '', tagline: '', moneda: 'EUR', idioma: 'es',
};

export default function SetupIdentidad({ onNext, onBack, onSkip }: StepProps) {
  const [form, setForm] = useState<BusinessConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setupFetch<Partial<BusinessConfig>>('/api/config/business')
      .then((data) => setForm({ ...EMPTY, ...data }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(field: keyof BusinessConfig) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave() {
    if (!form.nombreComercial.trim()) {
      toast.error('El nombre comercial es obligatorio');
      return;
    }
    setSaving(true);
    try {
      await setupFetch('/api/config/business', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      toast.success('Datos guardados correctamente');
      onNext();
    } catch (e: unknown) {
      toast.error('Error al guardar: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-zinc-500 py-10">
      <div className="animate-spin w-4 h-4 border border-amber-500 border-t-transparent rounded-full" />
      Cargando datos actuales…
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🏪 Identidad del restaurante</h2>
      <p className="text-zinc-500 mb-6">Configura el nombre, dirección y datos de contacto de tu local.</p>

      {/* Help */}
      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> El nombre comercial aparece en los tickets y la carta QR. El NIF es obligatorio para emitir facturas. La frase de marca aparece en el pie de los tickets.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Nombre comercial */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-400 mb-1">Nombre comercial <span className="text-amber-500">*</span></label>
          <input value={form.nombreComercial} onChange={set('nombreComercial')} placeholder="Ej: Restaurante Casa Pepe"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Razón social</label>
          <input value={form.razonSocial} onChange={set('razonSocial')} placeholder="Ej: Inversiones Gastronómicas SL"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">NIF / CIF <span className="text-amber-500">*</span></label>
          <input value={form.nif} onChange={set('nif')} placeholder="Ej: B12345678"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-400 mb-1">Dirección fiscal</label>
          <input value={form.direccionFiscal} onChange={set('direccionFiscal')} placeholder="Ej: C/ Mayor, 15, 2º"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Código postal</label>
          <input value={form.codigoPostal} onChange={set('codigoPostal')} placeholder="28001"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Población</label>
          <input value={form.poblacion} onChange={set('poblacion')} placeholder="Madrid"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Provincia</label>
          <input value={form.provincia} onChange={set('provincia')} placeholder="Madrid"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">País</label>
          <input value={form.pais} onChange={set('pais')} placeholder="España"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Teléfono</label>
          <input value={form.telefono} onChange={set('telefono')} type="tel" placeholder="+34 91 000 00 00"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
          <input value={form.email} onChange={set('email')} type="email" placeholder="info@restaurante.com"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Sitio web</label>
          <input value={form.web} onChange={set('web')} type="url" placeholder="https://www.mirestaurante.com"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">URL del logo</label>
          <input value={form.logoUrl} onChange={set('logoUrl')} type="url" placeholder="https://…/logo.png"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
          {form.logoUrl && <img src={form.logoUrl} alt="logo" className="mt-2 h-10 object-contain rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-400 mb-1">Frase de marca / Tagline</label>
          <input value={form.tagline} onChange={set('tagline')} placeholder="Ej: Cocina con sabor italiano"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Moneda</label>
          <select value={form.moneda} onChange={set('moneda')}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors">
            <option value="EUR">EUR — Euro (€)</option>
            <option value="USD">USD — Dólar ($)</option>
            <option value="GBP">GBP — Libra (£)</option>
            <option value="MXN">MXN — Peso mexicano</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Idioma</label>
          <select value={form.idioma} onChange={set('idioma')}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors">
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
            <option value="fr">Français</option>
            <option value="ca">Català</option>
            <option value="eu">Euskera</option>
            <option value="gl">Galego</option>
          </select>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
          ← Anterior
        </button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            Omitir
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar y continuar →'}
          </button>
        </div>
      </div>
    </div>
  );
}
