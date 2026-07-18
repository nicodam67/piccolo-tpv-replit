/**
 * TabletPinKeypad — large numeric keypad for PIN entry.
 * Confirms automatically when the expected PIN length is reached.
 * Shows lockout message after 3 failed attempts.
 */
import { useState, useEffect, useCallback } from "react";
import { Delete, X, Loader2 } from "lucide-react";

interface Employee { id: string; name: string; initials: string; }

interface PinResult {
  ok?: boolean;
  locked?: boolean;
  retryAfterSeconds?: number;
  attemptsLeft?: number;
  error?: string;
}

interface Props {
  employee: Employee;
  onSubmit: (pin: string) => Promise<PinResult>;
  onCancel: () => void;
}

const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
const MAX_PIN_LENGTH = 6;

export default function TabletPinKeypad({ employee, onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<{ until: Date } | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [shaking, setShaking] = useState(false);

  // Lockout countdown
  useEffect(() => {
    if (!lockout) return;
    const tick = setInterval(() => {
      const secs = Math.ceil((lockout.until.getTime() - Date.now()) / 1000);
      if (secs <= 0) { setLockout(null); setError(null); clearInterval(tick); }
      else setLockCountdown(secs);
    }, 1000);
    return () => clearInterval(tick);
  }, [lockout]);

  const submit = useCallback(async (currentPin: string) => {
    if (submitting || lockout) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(currentPin);
      if (result.locked) {
        const until = new Date(Date.now() + (result.retryAfterSeconds ?? 300) * 1000);
        setLockout({ until });
        setLockCountdown(result.retryAfterSeconds ?? 300);
        setPin("");
      } else if (!result.ok) {
        setShaking(true);
        setTimeout(() => setShaking(false), 600);
        setPin("");
        if (result.attemptsLeft !== undefined) setAttemptsLeft(result.attemptsLeft);
        setError(result.error ?? "PIN incorrecto");
      }
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, submitting, lockout]);

  function press(key: string) {
    if (submitting || lockout) return;
    if (key === "⌫") {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key)) return;
    const newPin = pin + key;
    setPin(newPin);
    if (newPin.length >= MAX_PIN_LENGTH) {
      submit(newPin);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      {/* Employee header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center text-2xl font-bold text-white">
          {employee.initials}
        </div>
        <div>
          <p className="text-white text-2xl font-semibold">{employee.name}</p>
          <p className="text-gray-400 text-sm">Introduce tu PIN</p>
        </div>
      </div>

      {/* PIN dots */}
      <div className={`flex gap-4 mb-6 transition-transform ${shaking ? "animate-[shake_0.5s_ease]" : ""}`}>
        {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-all ${
              i < pin.length
                ? "bg-teal-400 border-teal-400 scale-110"
                : "bg-transparent border-gray-600"
            }`}
          />
        ))}
      </div>

      {/* Error / lockout messages */}
      {lockout ? (
        <div className="mb-4 text-center bg-red-900/50 border border-red-500 rounded-2xl px-6 py-3">
          <p className="text-red-400 font-semibold">Demasiados intentos fallidos</p>
          <p className="text-gray-300 text-sm mt-1">Inténtalo en {lockCountdown} segundos</p>
        </div>
      ) : error ? (
        <div className="mb-4 text-center">
          <p className="text-red-400 font-medium">{error}</p>
          {attemptsLeft !== null && attemptsLeft > 0 && (
            <p className="text-gray-500 text-sm mt-1">{attemptsLeft} intento{attemptsLeft !== 1 ? "s" : ""} restante{attemptsLeft !== 1 ? "s" : ""}</p>
          )}
        </div>
      ) : (
        <div className="mb-4 h-10" />
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {KEYS.map((key, i) => {
          if (key === "") return <div key={i} />;
          const isDelete = key === "⌫";
          return (
            <button
              key={i}
              onClick={() => press(key)}
              disabled={submitting || !!lockout}
              className={`
                h-20 rounded-2xl text-2xl font-bold flex items-center justify-center
                transition-all duration-100 active:scale-95 disabled:opacity-40
                ${isDelete
                  ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  : "bg-gray-800 text-white hover:bg-gray-700 shadow-lg"
                }
              `}
            >
              {submitting && key === "0" ? (
                <Loader2 className="animate-spin w-6 h-6 text-teal-400" />
              ) : isDelete ? (
                <Delete size={22} />
              ) : (
                key
              )}
            </button>
          );
        })}
      </div>

      {/* Cancel */}
      <button
        onClick={onCancel}
        className="mt-8 flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
      >
        <X size={16} /> Cancelar
      </button>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-10px)}
          40%{transform:translateX(10px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
}
