// src/context/HealthMonitorContext.jsx
//
// Global health monitor — admin login olduğu andan itibaren tüm servisleri
// 3 saniyede bir paralel poll eder, latency history'sini biriktirir. Sayfa
// (System Health) sadece context'ten okuyup render eder; SystemHealth sayfası
// kapansa veya admin başka sayfaya geçse bile veri akar — geri döndüğünde
// "collecting trend…" durumu olmaz, mevcut history zaten dolu.
//
// Logout / non-admin → cleanup: interval temizlenir, state reset.

import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import adminApi from '../api/adminApi';

const HealthMonitorContext = createContext(null);

const SERVICES = [
  { key: 'auth',  fetchFn: 'getHealthAuth' },
  { key: 'txn',   fetchFn: 'getHealthTxn' },
  { key: 'ml',    fetchFn: 'getHealthMl' },
  { key: 'notif', fetchFn: 'getHealthNotif' },
];

const POLL_MS = 3_000;
const HISTORY_LEN = 20;

function parseHealthStatus(raw) {
  const d = raw?.data ?? raw;
  const s = (d?.status ?? '').toLowerCase();
  if (s === 'healthy')  return 'healthy';
  if (s === 'degraded') return 'degraded';
  return 'unhealthy';
}

const INITIAL_SERVICES = SERVICES.reduce(
  (acc, s) => ({ ...acc, [s.key]: { status: 'loading', latencyMs: null, checkedAt: null } }),
  {}
);
const INITIAL_HISTORY = Object.fromEntries(SERVICES.map((s) => [s.key, []]));

export function HealthMonitorProvider({ children }) {
  const { isAdmin } = useAuth();
  const [services, setServices] = useState(INITIAL_SERVICES);
  const [history,  setHistory]  = useState(INITIAL_HISTORY);
  const [broker,   setBroker]   = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!isAdmin) {
      // Reset on logout / role-down
      setServices(INITIAL_SERVICES);
      setHistory(INITIAL_HISTORY);
      setBroker({ data: null, loading: true, error: null });
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      const results = await Promise.all(
        SERVICES.map((s) => {
          const start = performance.now();
          return adminApi[s.fetchFn]()
            .then((res) => ({
              key: s.key,
              status: parseHealthStatus(res.data ?? res),
              latencyMs: Math.round(performance.now() - start),
            }))
            .catch(() => ({
              key: s.key,
              status: 'unhealthy',
              latencyMs: Math.round(performance.now() - start),
            }));
        })
      );

      if (cancelled) return;

      setServices((prev) => {
        const next = { ...prev };
        for (const r of results) {
          next[r.key] = { status: r.status, latencyMs: r.latencyMs, checkedAt: new Date() };
        }
        return next;
      });
      setHistory((prev) => {
        const next = { ...prev };
        for (const r of results) {
          next[r.key] = [...next[r.key], r.latencyMs].slice(-HISTORY_LEN);
        }
        return next;
      });

      adminApi.getBrokerOverview()
        .then((res) => {
          if (!cancelled) setBroker({ data: res.data, loading: false, error: null });
        })
        .catch(() => {
          // Broker geçici hatasında mevcut state'i koru — sparkline gibi şişirmeye gerek yok.
        });
    };

    tick();  // immediate first read
    const id = setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isAdmin]);

  return (
    <HealthMonitorContext.Provider value={{ services, broker, history }}>
      {children}
    </HealthMonitorContext.Provider>
  );
}

export function useHealthMonitor() {
  return useContext(HealthMonitorContext);
}
