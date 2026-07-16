import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch } from '../setupUtils';

interface FiscalForm {
  regimenFiscal: string;
  defaultIva: string;
  serieFacturacion: string;
  numeroInicialFactura: number;
  verifactuMode: string;
}

export default function SetupFiscalidad({ onNext, onBack, onSkip }: StepProps) {
  const [form, setForm] = useState<FiscalForm>({
    regimenFiscal: 'general',
    defaultIva: '10',
    serieFacturacion: 'A',
    numeroInicialFactura: 1,
    verifactuMode: 'pruebas',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setupFetch<Record<string, unknown>>('/api/config/business')
      .then((d) => {
        setForm((f) => ({
          ...f,
          regimenFiscal: (d.regimenFiscal as string) ?? 'general',
        }));
      })
      .catch(() => {});
  }, []);

  function set<K extends keyof FiscalForm>(field: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = field === 'numeroInicialFactura' ? Number(e.target.value) : e.target.value;
      setForm((f) => ({ ...f, [field]: val }));
    };
  }

  async function handleSave() {
    if (form.verifactuMode === 'produccion') {
      if (!window.confirm('⚠️ Estás a punto de activar VERI*FACTU en modo PRODUCCIÓN. Esto envía datos fiscales reales a la AEAT. ¿Seguro que quieres continuar?')) return;
    }
    setSaving(true);
    try {
      await setupFetch('/api/config/business', {
        method: 'PUT',
        body: JSON.stringify({ regimenFiscal: form.regimenFiscal }),
      });
      toast.success('Configuración fiscal guardada');
      onNext();
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">📋 Datos fiscales</h2>
      <p className="text-zinc-500 mb-6">Configura el régimen tributario y los parámetros de facturación.</p>

      {/* Warning for verifactu production */}
      <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4 mb-6 text-sm">
        <p className="text-amber-300 font-semibold mb-1">⚠️ Importante sobre VERI*FACTU</p>
        <p className="text-amber-200/70">El modo VERI*FACTU en <strong>pruebas</strong> no envía datos reales a la AEAT. Activa el modo <strong>producción</strong> solo cuando el sistema esté completamente listo y hayas obtenido el certificado digital.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-400 mb-1">Régimen fiscal</label>
          <select value={form.regimenFiscal} onChange={set('regimenFiscal')}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500">
            <option value="general">Régimen general (más habitual)</option>
            <option value="simplificado">Régimen simplificado</option>
            <option value="recargo_equivalencia">Recargo de equivalencia</option>
            <option value="regimen_especial">Régimen especial</option>
          </select>
          <p className="text-xs text-zinc-600 mt-1">El régimen general aplica a la gran mayoría de negocios de hostelería.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">IVA por defecto</label>
          <select value={form.defaultIva} onChange={set('defaultIva')}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500">
            <option value="10">10% — Hostelería (habitual)</option>
            <option value="21">21% — General</option>
            <option value="4">4% — Básicos</option>
            <option value="0">0% — Exento</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Serie de facturación</label>
          <input value={form.serieFacturacion} onChange={set('serieFacturacion')} maxLength={5}
            placeholder="A"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
          <p className="text-xs text-zinc-600 mt-1">Letra o código que precede al número de factura (ej: A-0001)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Número inicial de factura</label>
          <input value={form.numeroInicialFactura} onChange={set('numeroInicialFactura')} type="number" min={1}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
          <p className="text-xs text-zinc-600 mt-1">Si vienes de otro sistema, empieza donde lo dejaste.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Modo VERI*FACTU</label>
          <select value={form.verifactuMode} onChange={set('verifactuMode')}
            className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 ${
              form.verifactuMode === 'produccion' ? 'border-red-500/60' : 'border-zinc-700'
            }`}>
            <option value="pruebas">🧪 Modo pruebas (recomendado para el arranque)</option>
            <option value="produccion">⚡ Modo producción (datos reales a AEAT)</option>
          </select>
          {form.verifactuMode === 'produccion' && (
            <div className="mt-2 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-300">
              <span>🔴</span>
              <span>Modo producción activo. Asegúrate de tener el certificado digital configurado en la sección de documentos fiscales.</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mt-6">
        <p className="text-sm font-semibold text-zinc-300 mb-2">ℹ️ Configuración avanzada</p>
        <p className="text-xs text-zinc-500">Para configurar el certificado digital, los tipos de IVA por producto y los parámetros avanzados de VERI*FACTU, ve a <a href="/fiscal" target="_blank" className="text-amber-400 underline">Tipos de IVA</a> y <a href="/admin/verifactu" target="_blank" className="text-amber-400 underline">VERI*FACTU</a> desde el panel de administración.</p>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
          ← Anterior
        </button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Omitir</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar y continuar →'}
          </button>
        </div>
      </div>
    </div>
  );
}
