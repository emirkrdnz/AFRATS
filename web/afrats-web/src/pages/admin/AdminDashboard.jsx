// src/pages/admin/AdminDashboard.jsx
//
// Sprint AA — yeniden organize.
//   /admin           → Admin Dashboard (KPI + trend chart'lar + Top Categories + Risk Dist)
//   /admin/ml-models → ML Models (eski "Admin Dashboard" içeriği, 2 model kart)
//
// Layout:
//   Row 1: KPI strip 3 kart (Users · Tx Activity · Net Flow)
//   Row 2: Anomaly Trend + Income vs Expense
//   Row 3: Top Categories + Risk Distribution
//
// "Algorithm Breakdown" /admin/ml-models'a alındı (ensemble composition kısmı).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Filler, Tooltip, Legend,
} from 'chart.js';
import {
  FiTrendingUp, FiBarChart2, FiAlertTriangle,
  FiPieChart, FiUsers, FiActivity, FiCpu,
} from 'react-icons/fi';

import adminApi from '../../api/adminApi';
import { extractErrorMessage } from '../../api/errorHelper';
import { formatCompactCurrency, formatFullCurrency } from '../../utils/formatters';
import Card from '../../components/Card';
import Skeleton from '../../components/Skeleton';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Filler, Tooltip, Legend
);

// ── Outlier-robust eksen tavanı ──────────────────────────────────────────────
// Tek bir aşırı büyük değer (ör. bulk import günü, dev anomali tutarı) grafiğin
// Y-ölçeğini patlatıp geri kalan veriyi düz çizgiye çevirmesin diye: eğer max,
// 95. yüzdelikten belirgin büyükse ekseni p95'e göre "nice" bir tavana sabitle.
// Aksi halde undefined döner → Chart.js normal otomatik ölçek kullanır.
function niceCeil(x) {
  if (!(x > 0)) return undefined;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / mag;
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3
    : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
  return step * mag;
}
function robustMax(values) {
  if (!values) return undefined;
  const v = values.filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  if (v.length < 4) return undefined;
  const max = v[v.length - 1];
  if (max < 50) return undefined;                 // küçük sayılar — sınırlamaya gerek yok
  const p95 = v[Math.floor(0.95 * (v.length - 1))];
  if (p95 > 0 && max > p95 * 1.8) return niceCeil(p95 * 1.3);
  return undefined;                               // outlier yok → otomatik ölçek
}

function ErrorState({ message }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
      <FiAlertTriangle className="w-3.5 h-3.5 shrink-0" /> {message}
    </div>
  );
}

// Preset date range chips — sağ üst header'da. Backend zaten `days` parametre
// alıyor (timeseries, by-category), stats endpoint'i için startDate/endDate
// türetiliyor. Lifetime metrikler (Users + Risk Distribution) bu kontrolden
// etkilenmez — "Lifetime" badge ile ayrılır.
const DATE_PRESETS = [
  { label: '7d',  value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '1y',  value: 365 },
];

function DateRangeChips({ days, onChange }) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
      {DATE_PRESETS.map((p) => {
        const active = days === p.value;
        return (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors tabular-nums ${
              active
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// "Lifetime" badge — windowed metriklerden ayırt etmek için.
function LifetimeBadge() {
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wider"
      title="Not affected by date range — always current state"
    >
      Lifetime
    </span>
  );
}

// ── Adaptif auto-refresh sabitleri ────────────────────────────────────────
// Toplu import sonrası backend kullanıcıları teker teker yeniden skorlar
// (async, RabbitMQ). Sayılar oturana kadar sessizce poll edilir; STABLE_ROUNDS
// tur üst üste hiçbir şey değişmezse polling kendini durdurur.
const POLL_MS = 2000;
const STABLE_ROUNDS = 4;

// ── Sayı say-yukarı animasyonu ────────────────────────────────────────────
// Poll ile gelen kademeli değişimde değer bir anda zıplamasın; easeOutCubic ile
// eski değerden yenisine ~500ms akar. Yarıda yeni hedef gelirse, o an
// görüntülenen değerden devam eder (zıplama yok).
function useCountUp(target, duration = 500) {
  const safe = Number(target) || 0;
  const [display, setDisplay] = useState(safe);
  const displayRef = useRef(safe);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const from = displayRef.current;
    const to = Number(target) || 0;
    if (from === to) return undefined;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);            // easeOutCubic
      const val = from + (to - from) * eased;
      displayRef.current = val;
      setDisplay(val);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        displayRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

// Tamsayı KPI — say-yukarı + binlik ayraç.
function AnimatedInt({ value, className, style }) {
  const display = useCountUp(value ?? 0);
  return <span className={className} style={style}>{Math.round(display).toLocaleString()}</span>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [days, setDays] = useState(30);
  const [tx,       setTx]       = useState({ data: null, loading: true, error: null });
  const [risk,     setRisk]     = useState({ data: null, loading: true, error: null });
  const [category, setCategory] = useState({ data: null, loading: true, error: null });
  const [series,   setSeries]   = useState({ data: null, loading: true, error: null });

  // ── Tek noktadan veri çekme ───────────────────────────────────────────────
  // Hem ilk yükleme (days değişimi) hem adaptif auto-refresh aynı fonksiyonu
  // kullanır. `silent`: poll sırasında skeleton/hata flash'i olmasın diye
  // loading'e dokunmaz ve geçici hatada eldeki veriyi korur.
  // Dönüş: tüm payload'lardan türetilmiş imza (string) — poller "veri hâlâ
  // değişiyor mu?" kararını buna göre verir. Risk dağılımı lifetime'dır (days'i
  // yok sayar); birlikte çekmek sadece aynı sayıları tazeler, semantiği bozmaz.
  const fetchAll = useCallback(async (signal, { silent = false } = {}) => {
    const startDate = dayjs().subtract(days, 'day').toISOString();
    const endDate   = dayjs().toISOString();
    const cfg = { signal };

    if (!silent) {
      setRisk((p)     => ({ ...p, loading: true }));
      setTx((p)       => ({ ...p, loading: true }));
      setCategory((p) => ({ ...p, loading: true }));
      setSeries((p)   => ({ ...p, loading: true }));
    }

    const [riskRes, txRes, catRes, seriesRes] = await Promise.allSettled([
      adminApi.getRiskDistribution(cfg),
      adminApi.getTransactionStats({ startDate, endDate }, cfg),
      adminApi.getCategorySpending(days, 'Expense', cfg),
      adminApi.getTransactionTimeseries(days, cfg),
    ]);

    if (signal?.aborted) return null;

    // Her sonucu bağımsız uygula — biri patlasa diğerleri yine güncellenir.
    // silent + hata → eldeki veriyi koru (ekranda hata flash'i olmasın).
    const apply = (res, setter) => {
      if (res.status === 'fulfilled') {
        setter({ data: res.value.data, loading: false, error: null });
      } else if (!silent) {
        setter({ data: null, loading: false, error: extractErrorMessage(res.reason) });
      }
    };
    apply(riskRes, setRisk);
    apply(txRes, setTx);
    apply(catRes, setCategory);
    apply(seriesRes, setSeries);

    // Stabilite imzası: fulfilled → veri, rejected → sabit sentinel ('x') ki
    // kalıcı bir hata "sürekli değişiyor" sayılıp sonsuz poll'a takılmasın.
    const part = (res) => (res.status === 'fulfilled' ? res.value.data : 'x');
    return JSON.stringify([part(riskRes), part(txRes), part(catRes), part(seriesRes)]);
  }, [days]);

  // ── İlk yükleme + days değişimi (skeleton'lı) ─────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    // fetchAll skeleton için loading:true set eder — kasıtlı; "cascading render"
    // uyarısı bu fetch deseninde geçerli değil.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll(ctrl.signal, { silent: false });
    return () => ctrl.abort();
  }, [fetchAll]);

  // ── Adaptif auto-refresh ──────────────────────────────────────────────────
  // Sessizce poll eder; veri STABLE_ROUNDS tur üst üste değişmezse polling
  // kendini durdurur (sonsuz boşa istek yok). Sekmeye geri dönünce yeniden
  // başlar — başka sayfada import yapıp dönülen senaryoyu da yakalar.
  useEffect(() => {
    let cancelled = false;
    let stable = 0;
    let lastSig = null;
    let id = null;
    const ctrl = new AbortController();

    const tick = async () => {
      const sig = await fetchAll(ctrl.signal, { silent: true });
      if (cancelled || sig == null) return;
      if (sig === lastSig) {
        stable += 1;
        if (stable >= STABLE_ROUNDS && id) { clearInterval(id); id = null; }
      } else {
        stable = 0;
        lastSig = sig;
      }
    };

    const start = () => {
      if (id || cancelled) return;
      stable = 0;
      lastSig = null;
      id = setInterval(tick, POLL_MS);
    };

    start();
    window.addEventListener('focus', start);

    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      ctrl.abort();
      window.removeEventListener('focus', start);
    };
  }, [fetchAll]);

  // ── Derived: Tx Activity + Net Flow ──────────────────────────────────────
  const totalTx      = tx.data?.totalTransactionCount ?? null;
  const anomalyCount = tx.data?.anomalyCount ?? null;
  const totalIncome  = tx.data?.totalIncome ?? null;
  const totalExpense = tx.data?.totalExpense ?? null;
  const netFlow      = totalIncome != null && totalExpense != null
    ? totalIncome - totalExpense
    : null;

  // ── Derived: Risk counts ─────────────────────────────────────────────────
  const riskCounts = useMemo(() => {
    const r = risk.data;
    if (!r) return { low: 0, medium: 0, high: 0, total: 0 };
    const low    = r.lowRiskCount    ?? 0;
    const medium = r.mediumRiskCount ?? 0;
    const high   = r.highRiskCount   ?? 0;
    return { low, medium, high, total: r.totalUsers ?? (low + medium + high) };
  }, [risk.data]);

  // ── Derived: Timeseries labels ───────────────────────────────────────────
  const seriesData = series.data;
  const seriesLabels = useMemo(() => {
    if (!seriesData) return [];
    return seriesData.map((p) => dayjs(p.date).format('MMM D'));
  }, [seriesData]);

  // ── Outlier-robust eksen tavanları (tek dev değer ölçeği bozmasın) ────────
  const anomMax    = useMemo(() => robustMax(seriesData?.map((p) => p.anomalies)), [seriesData]);
  const totalTxMax = useMemo(() => robustMax(seriesData?.map((p) => p.totalTx)),   [seriesData]);
  const flowMax    = useMemo(
    () => robustMax(seriesData ? seriesData.flatMap((p) => [p.income, p.expense]) : null),
    [seriesData],
  );

  // ── Chart 1: Anomaly Trend ───────────────────────────────────────────────
  const anomalyChart = useMemo(() => {
    if (!seriesData) return null;
    return {
      labels: seriesLabels,
      datasets: [
        {
          label: 'Anomalies',
          data: seriesData.map((p) => p.anomalies),
          borderColor: '#E74C3C',
          backgroundColor: 'rgba(231, 76, 60, 0.15)',
          fill: true, tension: 0.35,
          pointRadius: 1.5, pointHoverRadius: 4,
          borderWidth: 1.8,
          yAxisID: 'y',
        },
        {
          label: 'Total Tx',
          data: seriesData.map((p) => p.totalTx),
          borderColor: '#2E86C1',
          backgroundColor: 'transparent',
          fill: false, tension: 0.35,
          pointRadius: 0, pointHoverRadius: 3,
          borderWidth: 1.3, borderDash: [4, 3],
          yAxisID: 'y1',
        },
      ],
    };
  }, [seriesData, seriesLabels]);

  // ── Chart 2: Income vs Expense ───────────────────────────────────────────
  const flowChart = useMemo(() => {
    if (!seriesData) return null;
    return {
      labels: seriesLabels,
      datasets: [
        { label: 'Income',  data: seriesData.map((p) => p.income),  backgroundColor: '#27AE60', borderRadius: 2, stack: 'i' },
        { label: 'Expense', data: seriesData.map((p) => p.expense), backgroundColor: '#E74C3C', borderRadius: 2, stack: 'e' },
      ],
    };
  }, [seriesData, seriesLabels]);

  // ── Chart 3: Top Categories (donut — tüm kategoriler, gruplama yok) ──────
  // 12 renkli palet ile her kategori ayrı bir dilim. Sıralama: totalAmount DESC.
  // Legend tarafında çok kategori varsa max-h ile scroll.
  const CATEGORY_PALETTE = [
    '#E74C3C', '#3498DB', '#9B59B6', '#1ABC9C', '#F39C12', '#34495E',
    '#27AE60', '#E67E22', '#16A085', '#8E44AD', '#2980B9', '#D35400',
  ];
  const categoryChart = useMemo(() => {
    const cats = category.data;
    if (!cats?.length) return null;
    const sorted = [...cats].sort((a, b) => b.totalAmount - a.totalAmount);
    return {
      labels: sorted.map((c) => c.categoryName),
      datasets: [
        {
          data: sorted.map((c) => c.totalAmount),
          backgroundColor: sorted.map((_, i) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]),
          borderWidth: 2,
          borderColor: '#FFFFFF',
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.data]);

  const totalCategoryAmount = useMemo(() => {
    if (!category.data) return 0;
    return category.data.reduce((a, c) => a + c.totalAmount, 0);
  }, [category.data]);


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Activity overview · daily trends · category spending
          </p>
        </div>
        <DateRangeChips days={days} onChange={setDays} />
      </div>

      {/* ── Row 1: KPI strip ── */}
      {tx.loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={144} rounded={8} />
          ))}
        </div>
      ) : tx.error ? (
        <ErrorState message={`Transaction stats: ${tx.error}`} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* 1. Users */}
          <div
            onClick={() => navigate('/admin/users')}
            className="bg-surface border border-border rounded-lg p-4 transition-colors hover:border-border-subtle hover:shadow-sm flex flex-col cursor-pointer"
            title="View users"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Users</span>
                <LifetimeBadge />
              </div>
              <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: '#8E44AD1A' }}>
                <FiUsers className="w-4 h-4" style={{ color: '#8E44AD' }} />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold leading-tight text-text">
                {riskCounts.total > 0 ? <AnimatedInt value={riskCounts.total} /> : '—'}
              </span>
              <span className="text-xs text-text-muted">scored users</span>
            </div>
            <div className="flex h-2 mt-auto rounded-full overflow-hidden bg-gray-100">
              {riskCounts.total > 0 && (
                <>
                  <div style={{ width: `${(riskCounts.low    / riskCounts.total) * 100}%`, minWidth: riskCounts.low    > 0 ? '2px' : 0, background: '#27AE60', transition: 'width 0.5s ease' }} />
                  <div style={{ width: `${(riskCounts.medium / riskCounts.total) * 100}%`, minWidth: riskCounts.medium > 0 ? '2px' : 0, background: '#F39C12', transition: 'width 0.5s ease' }} />
                  <div style={{ width: `${(riskCounts.high   / riskCounts.total) * 100}%`, minWidth: riskCounts.high   > 0 ? '2px' : 0, background: '#E74C3C', transition: 'width 0.5s ease' }} />
                </>
              )}
            </div>
            <div className="flex justify-between mt-2 text-[11px] text-text-muted">
              <span><span style={{ color: '#27AE60' }}>●</span> <AnimatedInt value={riskCounts.low} /> Low</span>
              <span><span style={{ color: '#F39C12' }}>●</span> <AnimatedInt value={riskCounts.medium} /> Med</span>
              <span><span style={{ color: '#E74C3C' }}>●</span> <AnimatedInt value={riskCounts.high} /> High</span>
            </div>
          </div>

          {/* 2. Transaction Activity */}
          {(() => {
            const normalCount = totalTx != null && anomalyCount != null
              ? Math.max(0, totalTx - anomalyCount)
              : null;
            const anomalyRate = totalTx > 0 && anomalyCount != null
              ? (anomalyCount / totalTx) * 100
              : null;
            return (
              <div
                onClick={() => navigate('/transactions')}
                className="bg-surface border border-border rounded-lg p-4 transition-colors hover:border-border-subtle hover:shadow-sm flex flex-col cursor-pointer"
                title="View all transactions"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    Transaction Activity
                  </span>
                  <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: '#1B4F721A' }}>
                    <FiActivity className="w-4 h-4" style={{ color: '#1B4F72' }} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold leading-tight text-text">
                    {totalTx != null ? <AnimatedInt value={totalTx} /> : '—'}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">Total transactions</div>
                </div>
                <div className="flex h-2 mt-auto rounded-full overflow-hidden bg-gray-100">
                  {totalTx > 0 && normalCount != null && anomalyCount != null && (
                    <>
                      <div style={{ width: `${(normalCount / totalTx) * 100}%`, minWidth: normalCount > 0 ? '2px' : 0, background: '#2E86C1', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${(anomalyCount / totalTx) * 100}%`, minWidth: anomalyCount > 0 ? '2px' : 0, background: '#E74C3C', transition: 'width 0.5s ease' }} />
                    </>
                  )}
                </div>
                <div className="flex justify-between mt-2 text-[11px] text-text-muted">
                  <span>
                    <span style={{ color: '#2E86C1' }}>●</span>{' '}
                    {normalCount != null ? <AnimatedInt value={normalCount} /> : '—'} normal
                  </span>
                  <span>
                    {anomalyRate != null ? `${anomalyRate.toFixed(1)}% anomaly rate` : '—'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 3. Net Flow */}
          {(() => {
            const incAbs = totalIncome  != null ? Math.abs(totalIncome)  : 0;
            const expAbs = totalExpense != null ? Math.abs(totalExpense) : 0;
            const maxAbs = Math.max(incAbs, expAbs) || 1;
            const incPct = (incAbs / maxAbs) * 100;
            const expPct = (expAbs / maxAbs) * 100;
            const netColor =
              netFlow == null   ? 'var(--color-text)' :
              netFlow <  0      ? '#E74C3C' :
              netFlow >  0      ? '#27AE60' :
                                  'var(--color-text)';
            const netStatus =
              netFlow == null   ? null :
              netFlow <  0      ? 'Cash outflow' :
              netFlow >  0      ? 'Cash surplus' :
                                  'Balanced';
            return (
              <div
                onClick={() => navigate('/transactions?type=Expense')}
                className="bg-surface border border-border rounded-lg p-4 transition-colors hover:border-border-subtle hover:shadow-sm flex flex-col cursor-pointer"
                title="View expense transactions"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    Net Flow
                  </span>
                  <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: '#27AE601A' }}>
                    <FiCpu className="w-4 h-4" style={{ color: '#27AE60' }} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold leading-tight"
                    style={{ color: netColor }}
                    title={netFlow != null ? formatFullCurrency(netFlow) : ''}
                  >
                    {netFlow != null ? formatCompactCurrency(netFlow) : '—'}
                  </span>
                  {netStatus && (
                    <span className="text-[11px] text-text-muted">{netStatus}</span>
                  )}
                </div>
                <div className="mt-auto space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-text-muted">
                        <span style={{ color: '#27AE60' }}>●</span> Income
                      </span>
                      <span
                        className="font-medium text-text"
                        title={totalIncome != null ? formatFullCurrency(totalIncome) : ''}
                      >
                        {totalIncome != null ? formatCompactCurrency(totalIncome) : '—'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div style={{
                        width: `${incPct}%`,
                        minWidth: incAbs > 0 ? '3px' : 0,
                        background: '#27AE60',
                        height: '100%',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-text-muted">
                        <span style={{ color: '#E74C3C' }}>●</span> Expense
                      </span>
                      <span
                        className="font-medium text-text"
                        title={totalExpense != null ? formatFullCurrency(totalExpense) : ''}
                      >
                        {totalExpense != null ? formatCompactCurrency(totalExpense) : '—'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div style={{
                        width: `${expPct}%`,
                        minWidth: expAbs > 0 ? '3px' : 0,
                        background: '#E74C3C',
                        height: '100%',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Row 2: 2 trend chart yan yana ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Anomaly Trend"
          subtitle={`Last ${days} days · daily anomaly count vs total transactions`}
          headerIcon={<FiTrendingUp className="w-5 h-5" />}
        >
          {series.loading ? (
            <Skeleton height={220} />
          ) : series.error ? (
            <ErrorState message={`Timeseries: ${series.error}`} />
          ) : anomalyChart ? (
            <div className="h-56">
              <Line
                data={anomalyChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        title: (items) => seriesLabels[items[0].dataIndex],
                      },
                    },
                  },
                  scales: {
                    x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkipPadding: 14 }, grid: { display: false } },
                    // Sol eksen: Anomalies (küçük ölçek, kendi başına okunur)
                    y: {
                      position: 'left',
                      beginAtZero: true,
                      max: anomMax,
                      ticks: { font: { size: 10 }, color: '#E74C3C', precision: 0 },
                      grid: { color: '#F3F4F6' },
                      title: { display: true, text: 'Anomalies', color: '#E74C3C', font: { size: 9 } },
                    },
                    // Sağ eksen: Total Tx (büyük ölçek) — ayrı eksende olduğu için
                    // spike anomali çizgisini artık ezmiyor; robust-max ile tavanlı.
                    y1: {
                      position: 'right',
                      beginAtZero: true,
                      max: totalTxMax,
                      ticks: { font: { size: 10 }, color: '#2E86C1', precision: 0 },
                      grid: { drawOnChartArea: false },
                      title: { display: true, text: 'Total Tx', color: '#2E86C1', font: { size: 9 } },
                    },
                  },
                }}
              />
            </div>
          ) : null}
        </Card>

        <Card
          title="Income vs Expense"
          subtitle={`Last ${days} days · daily totals in ₺`}
          headerIcon={<FiBarChart2 className="w-5 h-5" />}
        >
          {series.loading ? (
            <Skeleton height={220} />
          ) : series.error ? (
            <ErrorState message={`Timeseries: ${series.error}`} />
          ) : flowChart ? (
            <div className="h-56">
              <Bar
                data={flowChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        title: (items) => seriesLabels[items[0].dataIndex],
                        label: (ctx) => `${ctx.dataset.label}: ${formatCompactCurrency(ctx.parsed.y)}`,
                      },
                    },
                  },
                  scales: {
                    x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkipPadding: 14 }, grid: { display: false } },
                    y: {
                      beginAtZero: true,
                      max: flowMax,
                      ticks: {
                        font: { size: 10 },
                        callback: (v) => formatCompactCurrency(v).replace(' ₺', ''),
                      },
                      grid: { color: '#F3F4F6' },
                    },
                  },
                }}
              />
            </div>
          ) : null}
        </Card>
      </div>

      {/* ── Row 3: Top Categories (full width — Risk Distribution removed as it duplicated Users KPI) ── */}
      <div>
        {/* Top Categories */}
        <Card
          title="Top Categories"
          subtitle={`Last ${days} days · expense totals`}
          headerIcon={<FiPieChart className="w-5 h-5" />}
        >
          {category.loading ? (
            <Skeleton height={220} />
          ) : category.error ? (
            <ErrorState message={`Category: ${category.error}`} />
          ) : categoryChart ? (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-center">
              {/* Donut — sol */}
              <div className="h-56 flex items-center justify-center">
                <div className="h-full max-h-52">
                  <Doughnut
                    data={categoryChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: '60%',
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const v = ctx.parsed;
                              const pct = totalCategoryAmount > 0 ? ((v / totalCategoryAmount) * 100).toFixed(1) : 0;
                              return `${ctx.label}: ${formatCompactCurrency(v)} (${pct}%)`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
              {/* Legend — sağ, 2 kolon (full width sayesinde sığar) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1">
                {categoryChart.labels.map((label, i) => {
                  const amount = categoryChart.datasets[0].data[i];
                  const color  = categoryChart.datasets[0].backgroundColor[i];
                  const pct = totalCategoryAmount > 0 ? (amount / totalCategoryAmount) * 100 : 0;
                  return (
                    <div key={label} className="flex items-center justify-between gap-2 text-[10px] py-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span style={{
                          display: 'inline-block', width: 7, height: 7, borderRadius: 2,
                          background: color, flexShrink: 0,
                        }} />
                        <span className="truncate text-text">{label}</span>
                      </div>
                      <div className="flex items-baseline gap-1 shrink-0 tabular-nums">
                        <span className="font-medium text-text">{formatCompactCurrency(amount)}</span>
                        <span className="text-text-muted">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-text-muted py-6 text-center">
              No category data available.
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
