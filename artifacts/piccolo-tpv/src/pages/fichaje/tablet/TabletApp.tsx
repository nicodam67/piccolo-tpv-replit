/**
 * TabletApp — standalone kiosk wrapper for /fichaje/tablet.
 * No TPV navigation. Handles device registration and screen state machine.
 *
 * Screen flow (PIN):
 *   home → pin → status → confirmation → (auto-returns to home after 5 s)
 *
 * Screen flow (NFC):
 *   home → [NFC read] → status → confirmation → (auto-returns to home after 5 s)
 *
 * ⚠️ Sección NFC: IMPLEMENTACIÓN PREPARADA — PENDIENTE DE VALIDACIÓN FÍSICA
 *
 * Inactivity: 20 s of no interaction resets to home.
 */
import { useState, useEffect, useCallback } from "react";
import { Loader2, WifiOff } from "lucide-react";
import TabletHome, { type NfcClockStatus } from "./TabletHome";
import TabletPinKeypad from "./TabletPinKeypad";
import TabletEmployeeStatus from "./TabletEmployeeStatus";
import TabletConfirmation from "./TabletConfirmation";
import { useInactivityReset } from "./useInactivityReset";
import {
  deviceTokenRequest,
  getTabletDevice,
  getTimeclockPublicEmployeeStatus,
  idempotencyRequest,
  mergeRequest,
  pingTabletDevice,
  postTabletClock,
  registerTabletDevice,
  verifyTabletPin,
  ApiError,
} from "@workspace/api-client-react/timeclock";
import { APP_VERSION } from "../../../lib/app-version";
const TOKEN_KEY = "piccolo_tablet_token";

type Screen = "home" | "pin" | "status" | "confirmation";

interface Employee { id: string; name: string; initials: string; }

interface ClockStatus {
  status: "out" | "in" | "break";
  record: { id: string; clockIn: string } | null;
  activeBreak: { id: string; breakStart: string } | null;
}

interface PinResult {
  ok?: boolean;
  proofs?: Record<Action, string>;
  expiresAt?: string;
  locked?: boolean;
  retryAfterSeconds?: number;
  attemptsLeft?: number;
  error?: string;
}

type Action = "clock_in" | "clock_out" | "break_start" | "break_end";

const ACTION_LABELS: Record<Action, string> = {
  clock_in:    "Entrada registrada",
  clock_out:   "Salida registrada",
  break_start: "Descanso iniciado",
  break_end:   "Descanso finalizado",
};

function toInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

function toClockStatus(status: { status: ClockStatus["status"]; record?: { id: string; clockIn: string } | null; activeBreak?: { id: string; breakStart: string } | null }): ClockStatus {
  return {
    status: status.status,
    record: status.record ?? null,
    activeBreak: status.activeBreak ?? null,
  };
}

export default function TabletApp() {
  // ── Device registration state ──────────────────────────────────────────────
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"checking" | "ok" | "revoked" | "unregistered">("checking");
  const [regForm, setRegForm] = useState({ name: "Tablet Piccolo", location: "Piccolo La Ràpita", pairingCode: "" });
  const [registering, setRegistering] = useState(false);

  // ── Screen state machine ───────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [clockStatus, setClockStatus] = useState<ClockStatus | null>(null);
  const [clockProofs, setClockProofs] = useState<Record<Action, string> | null>(null);
  const [confirmation, setConfirmation] = useState<{ action: string; time: string; name: string } | null>(null);

  // ── Online indicator ───────────────────────────────────────────────────────
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Device validation on mount ─────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setDeviceStatus("unregistered"); return; }
    setDeviceToken(token);

    getTabletDevice(deviceTokenRequest(token))
      .then(data => {
        if (data.status === "revoked") { setDeviceStatus("revoked"); return; }
        setDeviceStatus("ok");
        pingTabletDevice({ appVersion: APP_VERSION }, deviceTokenRequest(token)).catch(() => {});
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setDeviceStatus("unregistered");
      });
  }, []);

  // ── Register new device ────────────────────────────────────────────────────
  async function registerDevice() {
    if (!regForm.name.trim()) return;
    setRegistering(true);
    try {
      const { deviceToken: token } = await registerTabletDevice({
        name: regForm.name,
        location: regForm.location,
        pairingCode: regForm.pairingCode,
      });
      localStorage.setItem(TOKEN_KEY, token);
      setDeviceToken(token);
      setDeviceStatus("ok");
    } catch (e) {
      const msg = e instanceof ApiError && e.data && typeof e.data === "object" && "error" in e.data
        ? String((e.data as { error?: string }).error)
        : "Error al registrar";
      alert(msg);
    } finally {
      setRegistering(false);
    }
  }

  // ── Auto-reset to home on inactivity ──────────────────────────────────────
  const resetToHome = useCallback(() => {
    setScreen("home");
    setSelectedEmployee(null);
    setClockStatus(null);
    setClockProofs(null);
    setConfirmation(null);
  }, []);

  useInactivityReset(resetToHome, 20);

  // ── Employee selected via PIN grid → load status → go to PIN ──────────────
  async function onEmployeeSelected(emp: Employee) {
    setSelectedEmployee(emp);
    try {
      const status = await getTimeclockPublicEmployeeStatus(emp.id, deviceTokenRequest(deviceToken ?? ""));
      setClockStatus(toClockStatus(status));
    } catch {
      setClockStatus({ status: "out", record: null, activeBreak: null });
    }
    setScreen("pin");
  }

  // ── Employee identified via NFC → skip PIN → go to status ─────────────────
  function onNfcIdentified(emp: Employee, nfcStatus: NfcClockStatus) {
    setSelectedEmployee(emp);
    setClockStatus(nfcStatus);
    setClockProofs(nfcStatus.proofs);
    setScreen("status");  // No PIN step for NFC
  }

  // ── PIN submitted ──────────────────────────────────────────────────────────
  async function onPinSubmit(pin: string): Promise<PinResult> {
    if (!selectedEmployee || !deviceToken) return { ok: false };
    try {
      const data = await verifyTabletPin({
        employeeId: selectedEmployee.id,
        pin,
        deviceToken,
      });
      if (data.ok) {
        setClockProofs(data.proofs ?? null);
        const status = await getTimeclockPublicEmployeeStatus(selectedEmployee.id, deviceTokenRequest(deviceToken));
        setClockStatus(toClockStatus(status));
        setScreen("status");
      }
      return data as PinResult;
    } catch (e) {
      if (e instanceof ApiError) {
        return (e.data ?? { ok: false, error: e.message }) as PinResult;
      }
      return { ok: false };
    }
  }

  // ── Clock action ───────────────────────────────────────────────────────────
  async function onAction(action: Action) {
    if (!selectedEmployee || !deviceToken || !clockProofs?.[action]) return;
    try {
      const idem = `${selectedEmployee.id}-${action}-${new Date().toISOString().slice(0, 16)}`;
      const data = await postTabletClock(
        {
          employeeId: selectedEmployee.id,
          action,
          deviceToken,
          proof: clockProofs[action],
        },
        mergeRequest(idempotencyRequest(idem)),
      );
      if (data.success) {
        setClockProofs(null);
        const rawTime = data.serverTime ?? new Date().toISOString();
        const t = new Date(rawTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        setConfirmation({ action: ACTION_LABELS[action], time: t, name: selectedEmployee.name });
        setScreen("confirmation");
        setTimeout(resetToHome, 5000);
      }
    } catch (e) {
      const msg = e instanceof ApiError && e.data && typeof e.data === "object" && "error" in e.data
        ? String((e.data as { error?: string }).error)
        : "Error al fichar";
      alert(msg);
    }
  }

  // ── Render: loading / unregistered / revoked / main ───────────────────────
  if (deviceStatus === "checking") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (deviceStatus === "revoked") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 border border-red-700 rounded-3xl p-8 w-full max-w-sm text-center">
          <WifiOff className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-white text-xl font-bold mb-2">Dispositivo revocado</h2>
          <p className="text-gray-400 text-sm">Este dispositivo ya no está autorizado. Contacte con el administrador para volver a registrarlo.</p>
          <button
            onClick={() => { localStorage.removeItem(TOKEN_KEY); setDeviceStatus("unregistered"); }}
            className="mt-6 text-teal-400 text-sm underline"
          >
            Registrar nuevo dispositivo
          </button>
        </div>
      </div>
    );
  }

  if (deviceStatus === "unregistered") {
    return (
      <div className="min-h-screen bg-teal-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4 text-3xl">📱</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Registrar tablet de fichaje</h2>
          <p className="text-gray-500 text-sm mb-6">Este dispositivo aún no está registrado. Pide al administrador que genere un código de emparejamiento desde <strong>Fichaje → Dispositivos</strong>.</p>
          <div className="space-y-3 text-left">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Código de emparejamiento (6 dígitos)</label>
              <input
                value={regForm.pairingCode}
                onChange={e => setRegForm(f => ({ ...f, pairingCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                placeholder="123456"
                inputMode="numeric"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 text-center text-xl tracking-widest font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nombre del dispositivo</label>
              <input
                value={regForm.name}
                onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ubicación</label>
              <input
                value={regForm.location}
                onChange={e => setRegForm(f => ({ ...f, location: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
          </div>
          <button
            onClick={registerDevice}
            disabled={registering || !regForm.name.trim() || regForm.pairingCode.length !== 6}
            className="mt-6 w-full bg-teal-600 text-white py-4 rounded-2xl font-semibold text-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors"
          >
            {registering ? <><Loader2 className="w-5 h-5 animate-spin" /> Registrando…</> : "Registrar dispositivo"}
          </button>
        </div>
      </div>
    );
  }

  // ── Main kiosk UI ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col overflow-hidden select-none">
      {!online && (
        <div className="bg-red-700 text-white text-center text-sm py-2 flex items-center justify-center gap-2 shrink-0">
          <WifiOff size={15} />
          Sin conexión — el fichaje no está disponible hasta que se recupere la red
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {screen === "home" && deviceToken && (
          <TabletHome
            deviceToken={deviceToken}
            onSelectEmployee={emp => {
              const withInitials: Employee = { ...emp, initials: toInitials(emp.name) };
              onEmployeeSelected(withInitials);
            }}
            onNfcIdentified={(emp, nfcStatus) => {
              const withInitials: Employee = { ...emp, initials: emp.initials ?? toInitials(emp.name) };
              onNfcIdentified(withInitials, nfcStatus);
            }}
          />
        )}

        {screen === "pin" && selectedEmployee && (
          <TabletPinKeypad
            employee={selectedEmployee}
            onSubmit={onPinSubmit}
            onCancel={resetToHome}
          />
        )}

        {screen === "status" && selectedEmployee && clockStatus && (
          <TabletEmployeeStatus
            employee={selectedEmployee}
            status={clockStatus}
            onAction={onAction}
            onCancel={resetToHome}
          />
        )}

        {screen === "confirmation" && confirmation && (
          <TabletConfirmation
            action={confirmation.action}
            time={confirmation.time}
            employeeName={confirmation.name}
            onClose={resetToHome}
          />
        )}
      </div>
    </div>
  );
}
