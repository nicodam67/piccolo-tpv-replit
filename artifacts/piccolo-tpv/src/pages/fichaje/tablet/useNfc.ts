/**
 * useNfc — encapsula la Web NFC API (NDEFReader).
 *
 * ⚠️  IMPLEMENTACIÓN PREPARADA — PENDIENTE DE VALIDACIÓN FÍSICA CON HARDWARE REAL
 * Web NFC solo funciona en:
 *   - Chrome 89+ para Android
 *   - Conexión HTTPS (o localhost)
 *   - Dispositivo con hardware NFC
 *
 * Expone:
 *   isSupported   — true si el navegador tiene NDEFReader
 *   isScanning    — true mientras el lector está activo
 *   lastRead      — último UID leído { uid, readAt }
 *   error         — mensaje de error si la lectura falla
 *   startScanning — activa el lector NFC
 *   stopScanning  — detiene el lector NFC
 *
 * Anti-rebote: la misma tarjeta no emite un segundo evento hasta pasados 5 s.
 */
import { useState, useRef, useCallback, useEffect } from "react";

// ── Web NFC type stubs (no están en @types/dom estándar aún) ─────────────────
interface NDEFMessage {
  records: NDEFRecord[];
}
interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  data?: DataView;
}
interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: NDEFMessage;
}
interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
}
interface NDEFReaderConstructor {
  new(): NDEFReader;
}

declare global {
  interface Window {
    NDEFReader?: NDEFReaderConstructor;
  }
}

export interface NfcRead {
  uid: string;   // UID en minúsculas, separado por ":"
  readAt: Date;
}

export interface UseNfcReturn {
  isSupported: boolean;
  isScanning: boolean;
  lastRead: NfcRead | null;
  error: string | null;
  startScanning: () => Promise<void>;
  stopScanning: () => void;
}

const DEBOUNCE_MS = 5_000; // misma tarjeta ignorada 5 s tras primera lectura

export function useNfc(): UseNfcReturn {
  const isSupported = typeof window !== "undefined" && "NDEFReader" in window;

  const [isScanning, setIsScanning] = useState(false);
  const [lastRead, setLastRead] = useState<NfcRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastUidRef = useRef<string | null>(null);
  const lastUidTimeRef = useRef<number>(0);

  const stopScanning = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsScanning(false);
  }, []);

  const startScanning = useCallback(async () => {
    if (!isSupported) {
      setError("Web NFC no está disponible en este navegador o dispositivo");
      return;
    }
    if (isScanning) return;

    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // ⚠️  Requiere hardware NFC real para funcionar — en emulador/escritorio
      //     lanzará un error de permisos o de hardware no disponible.
      const reader = new window.NDEFReader!();

      reader.onreading = (event: NDEFReadingEvent) => {
        const uid = event.serialNumber.toLowerCase();
        const now = Date.now();

        // Anti-rebote: misma tarjeta en menos de 5 s → ignorar
        if (uid === lastUidRef.current && now - lastUidTimeRef.current < DEBOUNCE_MS) {
          return;
        }

        lastUidRef.current = uid;
        lastUidTimeRef.current = now;
        setLastRead({ uid, readAt: new Date() });
      };

      reader.onreadingerror = () => {
        setError("Error al leer la tarjeta NFC. Acerque de nuevo la tarjeta.");
      };

      await reader.scan({ signal: controller.signal });
      setIsScanning(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("AbortError") || msg.includes("abort")) return;
      setError(`NFC: ${msg}`);
      setIsScanning(false);
    }
  }, [isSupported, isScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { isSupported, isScanning, lastRead, error, startScanning, stopScanning };
}
