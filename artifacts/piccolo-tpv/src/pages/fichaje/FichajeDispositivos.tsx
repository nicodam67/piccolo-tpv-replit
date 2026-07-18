/**
 * FichajeDispositivos — admin management of registered tablet kiosks.
 * Shows status, last seen, allows rename, activate, revoke.
 */
import { useState, useEffect } from "react";
import { Tablet, RefreshCw, Pencil, CheckCircle, XCircle, Clock, Key, Copy, Check } from "lucide-react";
import { api } from "../../lib/api-client";

interface Device {
  id: string;
  name: string;
  location: string;
  status: "active" | "revoked";
  lastSeenAt: string | null;
  appVersion: string | null;
  createdAt: string;
  revokedAt: string | null;
}

function fmtRelative(iso: string | null) {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function RenameModal({ device, onClose, onSaved }: { device: Device; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/api/tablet/devices/${device.id}`, { name, location });
      onSaved();
    } catch { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Renombrar dispositivo</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ubicación</label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-xl py-2 text-sm text-foreground hover:bg-secondary">Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim()}
            className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm disabled:opacity-50 hover:bg-teal-700">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PairingCode { code: string; expiresAt: string; expiresInSeconds: number; }

function PairingCodeModal({ code, onClose }: { code: PairingCode; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [secs, setSecs] = useState(Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - Date.now()) / 1000));
      setSecs(remaining);
      if (remaining === 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [code.expiresAt]);

  function copy() {
    navigator.clipboard.writeText(code.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
          <Key className="w-6 h-6 text-teal-500" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-1">Código de emparejamiento</h3>
        <p className="text-muted-foreground text-sm mb-6">Introduce este código en la tablet cuando aparezca la pantalla de registro</p>
        <div className="text-5xl font-mono font-bold text-foreground tracking-widest mb-2 select-all">
          {code.code}
        </div>
        <div className={`text-sm mb-6 ${secs <= 60 ? "text-red-400" : "text-muted-foreground"}`}>
          {secs > 0 ? `Caduca en ${secs} segundos` : "Código caducado"}
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="flex-1 flex items-center justify-center gap-2 border border-border rounded-xl py-2 text-sm text-foreground hover:bg-secondary">
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button onClick={onClose} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm hover:bg-teal-700">Listo</button>
        </div>
      </div>
    </div>
  );
}

export default function FichajeDispositivos() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<Device | null>(null);
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  function load() {
    setLoading(true);
    api.get<Device[]>("/api/tablet/devices")
      .then(d => setDevices(Array.isArray(d) ? d : []))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function generatePairingCode() {
    setGeneratingCode(true);
    try {
      const result = await api.post<PairingCode>("/api/tablet/devices/pairing-code");
      setPairingCode(result);
    } catch { alert("Error al generar código"); }
    finally { setGeneratingCode(false); }
  }

  async function revoke(device: Device) {
    if (!confirm(`¿Revocar "${device.name}"? El dispositivo dejará de poder fichar.`)) return;
    await api.delete(`/api/tablet/devices/${device.id}`).catch(() => {});
    load();
  }

  async function activate(device: Device) {
    await api.patch(`/api/tablet/devices/${device.id}`, { status: "active" }).catch(() => {});
    load();
  }

  const active = devices.filter(d => d.status === "active");
  const revoked = devices.filter(d => d.status === "revoked");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dispositivos de fichaje</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {active.length} tablet{active.length !== 1 ? "s" : ""} activa{active.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary">
            <RefreshCw size={14} /> Actualizar
          </button>
          <button
            onClick={generatePairingCode}
            disabled={generatingCode}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50"
          >
            <Key size={14} /> {generatingCode ? "Generando…" : "Nueva tablet"}
          </button>
          <a
            href="/fichaje/tablet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <Tablet size={14} /> Abrir tablet
          </a>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando dispositivos…</div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tablet className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Sin dispositivos registrados</p>
          <p className="text-sm mt-1">Abre <code className="bg-secondary px-1 rounded">/fichaje/tablet</code> en la tablet para registrarla automáticamente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active devices */}
          {active.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Activas</h2>
              {active.map(d => {
                const isRecent = d.lastSeenAt && (Date.now() - new Date(d.lastSeenAt).getTime()) < 5 * 60 * 1000;
                return (
                  <div key={d.id} className="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl">
                    <div className="relative shrink-0">
                      <Tablet className="w-8 h-8 text-teal-500" />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${isRecent ? "bg-green-500" : "bg-gray-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm">{d.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{d.location}</span>
                        <span className="flex items-center gap-1"><Clock size={10} /> {fmtRelative(d.lastSeenAt)}</span>
                        {d.appVersion && <span>v{d.appVersion}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 flex items-center gap-1 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                        <CheckCircle size={10} /> Activa
                      </span>
                      <button onClick={() => setRenaming(d)}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => revoke(d)}
                        className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20">
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Revoked devices */}
          {revoked.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mt-4">Revocadas</h2>
              {revoked.map(d => (
                <div key={d.id} className="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl opacity-60">
                  <Tablet className="w-8 h-8 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{d.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.location}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400">
                      Revocada
                    </span>
                    <button onClick={() => activate(d)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-teal-500/30 text-teal-500 hover:bg-teal-500/10">
                      Reactivar
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {renaming && (
        <RenameModal device={renaming} onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); load(); }} />
      )}
      {pairingCode && (
        <PairingCodeModal code={pairingCode} onClose={() => setPairingCode(null)} />
      )}
    </div>
  );
}
