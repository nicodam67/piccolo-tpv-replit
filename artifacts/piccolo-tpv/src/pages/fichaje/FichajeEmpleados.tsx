/**
 * Empleados de fichaje — gestión de personal para control horario.
 * Comparte la misma tabla employees del módulo HR.
 *
 * Incluye sección "Tarjetas NFC" en el modal de edición de empleado.
 * ⚠️ Asignación de tarjetas: PENDIENTE DE VALIDACIÓN FÍSICA CON HARDWARE REAL
 */
import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Users, Edit, Power, Key, Nfc, Trash2, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { api } from "../../lib/api-client";
import {
  assignTimeclockNfcCard,
  getTimeclockNfcCards,
  revokeTimeclockNfcCard,
} from "@workspace/api-client-react/timeclock";
import type { NfcCardBrief } from "@workspace/api-client-react/timeclock";
import { useNfc } from "./tablet/useNfc";

interface FichajeEmployee {
  id: string;
  name: string;
  role: string;
  active: boolean;
  pin?: string;
  anvizId?: string;
}

interface NfcCard extends NfcCardBrief {}

// ─── NFC Card Management Modal ────────────────────────────────────────────────
function NfcCardsModal({
  employee,
  onClose,
}: {
  employee: FichajeEmployee;
  onClose: () => void;
}) {
  const nfc = useNfc();
  const [cards, setCards] = useState<NfcCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [alias, setAlias] = useState("");
  const [waitingNfc, setWaitingNfc] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<NfcCard | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  function flash(text: string, type: "ok" | "err" = "ok") {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  }

  const loadCards = useCallback(() => {
    setLoading(true);
    getTimeclockNfcCards(employee.id)
      .then(d => setCards(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee.id]);

  useEffect(() => { loadCards(); }, [loadCards]);

  // Listen for NFC reads when in assignment mode
  useEffect(() => {
    if (!waitingNfc || !nfc.lastRead) return;
    void handleNfcRead(nfc.lastRead.uid);
  }, [nfc.lastRead]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startAssign() {
    if (!nfc.isSupported) {
      flash("NFC no disponible en este dispositivo. Usa la tablet de fichaje para asignar tarjetas.", "err");
      return;
    }
    setWaitingNfc(true);
    await nfc.startScanning();
  }

  async function handleNfcRead(uid: string) {
    setWaitingNfc(false);
    nfc.stopScanning();
    setAssigning(true);
    try {
      await assignTimeclockNfcCard({
        employeeId: employee.id,
        rawToken: uid,
        alias: alias.trim() || undefined,
      });
      flash(`Tarjeta asignada correctamente a ${employee.name}`);
      setAlias("");
      loadCards();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al asignar la tarjeta";
      flash(msg, "err");
    } finally {
      setAssigning(false);
    }
  }

  async function revokeCard() {
    if (!revokeTarget) return;
    try {
      await revokeTimeclockNfcCard(revokeTarget.id, {
        reason: revokeReason.trim() || "Revocada por administrador",
      });
      flash("Tarjeta revocada");
      setRevokeTarget(null);
      setRevokeReason("");
      loadCards();
    } catch {
      flash("Error al revocar la tarjeta", "err");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Nfc size={18} className="text-teal-500" />
              Tarjetas NFC
            </h3>
            <p className="text-sm text-muted-foreground">{employee.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">✕</button>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div className={`mx-5 mt-4 px-4 py-2 rounded-xl text-sm flex items-center gap-2 ${
            statusMsg.type === "ok" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
          }`}>
            {statusMsg.type === "ok" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {statusMsg.text}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Assign new card */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Asignar nueva tarjeta</h4>
            {!nfc.isSupported && (
              <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>NFC no disponible en este dispositivo. Para asignar tarjetas, abre esta pantalla desde la tablet de fichaje (Chrome Android con NFC).</span>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Alias (opcional)</label>
              <input
                value={alias}
                onChange={e => setAlias(e.target.value)}
                placeholder="Ej: Llavero azul"
                className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>

            {waitingNfc ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-16 h-16 rounded-full border-2 border-teal-500/30 animate-ping" style={{ animationDuration: "1.5s" }} />
                  <div className="w-12 h-12 rounded-full bg-teal-500/15 flex items-center justify-center">
                    <Nfc size={22} className="text-teal-400" />
                  </div>
                </div>
                <p className="text-sm text-teal-400 font-medium">Acerque la tarjeta al lector NFC…</p>
                <button
                  onClick={() => { setWaitingNfc(false); nfc.stopScanning(); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={startAssign}
                disabled={assigning || !nfc.isSupported}
                className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
              >
                <Nfc size={15} />
                {assigning ? "Asignando…" : nfc.isSupported ? "Asignar tarjeta NFC" : "NFC no disponible"}
              </button>
            )}

            {nfc.error && (
              <p className="text-xs text-red-500">{nfc.error}</p>
            )}
          </div>

          {/* Cards list */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">
              Tarjetas registradas
              {cards.length > 0 && <span className="ml-2 text-xs text-muted-foreground">({cards.length})</span>}
            </h4>

            {loading ? (
              <div className="text-center py-6 text-muted-foreground text-sm">Cargando…</div>
            ) : cards.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Nfc size={28} className="mx-auto mb-2 opacity-30" />
                Sin tarjetas asignadas
              </div>
            ) : (
              <div className="space-y-2">
                {cards.map(card => (
                  <div key={card.id} className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${
                    card.status === "revoked" ? "border-red-500/20 bg-red-500/5 opacity-60" : "border-border bg-secondary/30"
                  }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      card.status === "active" ? "bg-teal-500/15" : "bg-red-500/15"
                    }`}>
                      {card.status === "active" ? (
                        <CheckCircle size={15} className="text-teal-500" />
                      ) : (
                        <XCircle size={15} className="text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {card.alias ?? "Sin alias"}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {card.lastUsedAt ? (
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            Último uso: {new Date(card.lastUsedAt).toLocaleDateString("es-ES")}
                          </span>
                        ) : (
                          <span>Sin usos</span>
                        )}
                        {card.status === "revoked" && card.revokedReason && (
                          <span className="text-red-500">{card.revokedReason}</span>
                        )}
                      </div>
                    </div>
                    {card.status === "active" && (
                      <button
                        onClick={() => setRevokeTarget(card)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"
                        title="Revocar tarjeta"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Revoke confirmation */}
        {revokeTarget && (
          <div className="p-5 border-t border-border bg-red-500/5 flex-shrink-0">
            <p className="text-sm font-semibold text-red-600 mb-2">Revocar tarjeta "{revokeTarget.alias ?? "Sin alias"}"</p>
            <input
              value={revokeReason}
              onChange={e => setRevokeReason(e.target.value)}
              placeholder="Motivo (ej: tarjeta perdida)"
              className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setRevokeTarget(null); setRevokeReason(""); }}
                className="flex-1 border border-border py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={revokeCard}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-sm font-semibold"
              >
                Revocar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FichajeEmpleados() {
  const [employees, setEmployees] = useState<FichajeEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nfcTarget, setNfcTarget] = useState<FichajeEmployee | null>(null);

  useEffect(() => {
    api.get<FichajeEmployee[]>("/api/employees")
      .then(d => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empleados</h1>
          <p className="text-muted-foreground text-sm mt-1">Personal registrado para control horario</p>
        </div>
        <button className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
          <Plus size={16} /> Nuevo empleado
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar empleado…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando…</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => (
            <div key={emp.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{emp.name}</p>
                <p className="text-xs text-muted-foreground">{emp.role}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${emp.active ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  {emp.active ? "Activo" : "Inactivo"}
                </span>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Editar">
                  <Edit size={15} />
                </button>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="PIN">
                  <Key size={15} />
                </button>
                <button
                  onClick={() => setNfcTarget(emp)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-teal-500 hover:bg-teal-500/10 transition-colors"
                  title="Tarjetas NFC"
                >
                  <Nfc size={15} />
                </button>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Activar/Desactivar">
                  <Power size={15} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users size={36} className="mx-auto mb-2 opacity-30" />
              No se encontraron empleados
            </div>
          )}
        </div>
      )}

      {/* NFC Card Management Modal */}
      {nfcTarget && (
        <NfcCardsModal
          employee={nfcTarget}
          onClose={() => setNfcTarget(null)}
        />
      )}
    </div>
  );
}
