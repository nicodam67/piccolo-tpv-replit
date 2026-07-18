/**
 * useTabletClock — server-synced clock.
 * Syncs with server via Date response header every 30 s.
 * Returns display strings updated every second.
 */
import { useState, useEffect, useRef } from "react";

const BASE = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(/\/$/, "");

export function useTabletClock() {
  const [time, setTime] = useState(new Date());
  const offsetRef = useRef(0);

  async function sync() {
    try {
      const before = Date.now();
      const r = await fetch(`${BASE}/api/healthz`, { cache: "no-store" });
      const after = Date.now();
      const dateHeader = r.headers.get("date");
      if (dateHeader) {
        const serverMs = new Date(dateHeader).getTime();
        offsetRef.current = serverMs - (before + (after - before) / 2);
      }
    } catch { /* keep previous offset */ }
  }

  useEffect(() => {
    sync();
    const syncInterval = setInterval(sync, 30_000);
    const tick = setInterval(() => setTime(new Date(Date.now() + offsetRef.current)), 1_000);
    return () => { clearInterval(syncInterval); clearInterval(tick); };
  }, []);

  return {
    timeDisplay: time.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    dateDisplay: time.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    isoNow: time.toISOString(),
  };
}
