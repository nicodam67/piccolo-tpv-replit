/**
 * TabletConfirmation — post-action screen shown for 5 s then auto-closes.
 */
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

interface Props {
  action: string;
  time: string;
  employeeName: string;
  onClose: () => void;
}

export default function TabletConfirmation({ action, time, employeeName, onClose }: Props) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown <= 0) { onClose(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onClose]);

  return (
    <div className="min-h-screen bg-teal-600 flex flex-col items-center justify-center p-8 text-white text-center">
      <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center mb-8 animate-pulse">
        <CheckCircle2 className="w-16 h-16 text-white" />
      </div>

      <h1 className="text-4xl font-bold mb-3">{action}</h1>
      <p className="text-2xl text-teal-100 mb-2">{employeeName}</p>
      <p className="text-3xl font-mono font-semibold text-white mt-4">{time}</p>

      <div className="mt-12 flex flex-col items-center gap-2">
        <p className="text-teal-200 text-sm">Volviendo al inicio en</p>
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
          {countdown}
        </div>
      </div>

      <button
        onClick={onClose}
        className="mt-8 px-8 py-3 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-medium transition-colors"
      >
        Volver ahora
      </button>
    </div>
  );
}
