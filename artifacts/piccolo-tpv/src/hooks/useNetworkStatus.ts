/**
 * useNetworkStatus — detects real connectivity by pinging the server
 * Returns: { isOnline, isServerReachable, pendingOps, triggerSync }
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineOps } from '../lib/offline-db';
import { syncQueue } from '../lib/offline-queue';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
const PING_INTERVAL = 30_000;

export interface NetworkStatus {
  isOnline: boolean;           // navigator.onLine
  isServerReachable: boolean;  // confirmed via ping
  pendingOps: number;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
  lastChecked: Date | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [pendingOps, setPendingOps] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkServer = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      setIsServerReachable(r.ok);
    } catch {
      setIsServerReachable(false);
    }
    setLastChecked(new Date());
  }, []);

  const refreshPending = useCallback(async () => {
    const count = await offlineOps.count().catch(() => 0);
    setPendingOps(count);
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    const token = localStorage.getItem('token') ?? '';
    if (!token) return;
    setIsSyncing(true);
    try {
      await syncQueue(token);
      await refreshPending();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPending]);

  // Online/offline events
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); void checkServer(); void triggerSync(); };
    const onOffline = () => { setIsOnline(false); setIsServerReachable(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [checkServer, triggerSync]);

  // Periodic ping
  useEffect(() => {
    void checkServer();
    void refreshPending();
    pingTimer.current = setInterval(() => {
      void checkServer();
      void refreshPending();
    }, PING_INTERVAL);
    return () => {
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, [checkServer, refreshPending]);

  // Service worker message listener
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'TRIGGER_SYNC') void triggerSync();
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [triggerSync]);

  return { isOnline, isServerReachable, pendingOps, isSyncing, triggerSync, lastChecked };
}
