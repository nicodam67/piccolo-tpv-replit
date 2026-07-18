/**
 * useInactivityReset — calls onReset() after `seconds` of no interaction.
 * Resets the timer on any touch / mouse / keyboard event.
 */
import { useEffect, useRef, useCallback } from "react";

export function useInactivityReset(onReset: () => void, seconds = 20) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  const restart = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onResetRef.current(), seconds * 1000);
  }, [seconds]);

  useEffect(() => {
    const events = ["touchstart", "mousedown", "keydown", "pointerdown", "scroll"];
    const handler = () => restart();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    restart();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [restart]);
}
