// src/pages/dashboard/Dashboard.jsx
// AFRATS Dashboard — v3
//
// Changes vs v2:
//   - Currency formatting via shared formatCurrency (TRY)
//   - Recent Anomalies table aligned 1:1 with AnomalyList.jsx redesign:
//       • Risk level column removed
//       • Filter pills (All / High / Medium / Low) removed
//       • AlgoBadge matches AnomalyList (30×22 px, dark-navy active)
//       • ScoreBar matches AnomalyList (44 px bar, monospace score)
//       • Status uses inline STATUS_STYLE tokens (no Badge component)
//       • Row hover: single ANOMALY_COLOR left border (not per-risk-level)
//       • Chevron column added at far right

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement, BarElement, CategoryScale, LinearScale,
  PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js';
import dayjs from 'dayjs';
import { jwtDecode } from 'jwt-decode';
import {
  FiTrendingUp, FiTrendingDown, FiDollarSign, FiActivity,
  FiAlertTriangle, FiChevronLeft, FiChevronRight, FiBell,
  FiArrowRight, FiShield, FiCpu, FiPieChart,
} from 'react-icons/fi';

import transactionApi  from '../../api/transactionApi';
import mlApi           from '../../api/mlApi';
import notificationApi from '../../api/notificationApi';
import SummaryCard from '../../components/SummaryCard';
import Card from '../../components/Card';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import AlgoBadge from '../../components/anomaly/AlgoBadge';
import ScoreBar from '../../components/anomaly/ScoreBar';
import { formatCurrency, formatDate, formatTwoMonthLabel } from '../../utils/formatters';
import { ANOMALY_STATUS_LABELS, ANOMALY_STATUS_STYLES } from '../../utils/statusStyles';
import { ALGORITHMS, ALGO_KEY_BY_BACKEND } from '../../utils/anomalyAlgorithms';
import { useAuth } from '../../context/useAuth';

ChartJS.register(
  ArcElement, BarElement, CategoryScale, LinearScale,
  PointElement, LineElement, Filler, Tooltip, Legend
);

// Single accent for every anomaly row — matches AnomalyList
const ANOMALY_COLOR = '#E74C3C';

// ── Adaptif auto-refresh ──────────────────────────────────────────────────
// Import/işlem sonrası backend risk skorunu async (RabbitMQ) ve teker teker
// hesaplar; skor birkaç saniyede oturur. Veri STABLE_ROUNDS tur üst üste
// değişmezse polling kendini durdurur.
const POLL_MS = 2000;
const STABLE_ROUNDS = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Constants & data helpers
// ─────────────────────────────────────────────────────────────────────────────

// TODO 2C: tokenize chart palettes (chart.js dataset configs need literal hex,
// not CSS vars, because canvas paint values are resolved client-side without
// CSS context). Migrate via getComputedStyle on documentElement.
const RISK_COLORS     = { Low: '#27AE60', Medium: '#F39C12', High: '#E74C3C' };
const RISK_BG         = { Low: 'rgba(39,174,96,0.09)', Medium: 'rgba(243,156,18,0.09)', High: 'rgba(231,76,60,0.09)' };
const CATEGORY_PALETTE = [
  '#1B4F72','#2E86C1','#27AE60','#F39C12',
  '#E74C3C','#8E44AD','#16A085','#7F8C8D',
];

function pickRiskLevel(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}
function buildTrend(current, previous, higherIsBetter = true) {
  if (previous == null || previous === 0) return null;
  const diff      = current - previous;
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const isPositive = higherIsBetter ? diff >= 0 : diff <= 0;
  return { direction, percent: Math.abs((diff / previous) * 100), isPositive };
}
// Anlamlı yüzdeler — RiskDetail ile birebir aynı formül.
//   Spending vs Income = debt_ratio * 100  (121% = "gelirin %21 üzerinde harcadın")
//   Spending Trend     = (spending_trend - 1) * 100  (0% = sabit, +20% = arttı)
//   Anomaly Rate       = (frontend hesaplar — anomaly_weight ML §7.2 bug bypass)
function describeDashboardFactors(factors, anomalyPct) {
  const dr = Number(factors?.debt_ratio     ?? 0);
  const st = Number(factors?.spending_trend ?? 1);
  const aw = Number(anomalyPct ?? 0);

  const spendPct = dr * 100;
  const trendPct = (st - 1) * 100;

  const anomalyDesc =
    aw >= 30 ? `${aw.toFixed(0)}% of recent txns flagged`
    : aw >= 10 ? `Moderate flagged activity (${aw.toFixed(0)}%)`
    : aw > 0   ? `Low — ${aw.toFixed(0)}% of recent txns flagged`
    : 'No flagged transactions';
  const spendDesc =
    spendPct >= 100 ? `Expenses exceed income (${spendPct.toFixed(0)}%)`
    : spendPct >= 80 ? `Tight — ${spendPct.toFixed(0)}% of income spent`
    : `Healthy — ${spendPct.toFixed(0)}% of income spent`;
  // Backend `factors.spending_trend_months` ile kıyaslanan ay'ları gönderir
  // (RiskDetail ile aynı kaynaktan). "vs last month" varsayımı yerine
  // gerçek ay isimlerini göster: "Up 27% — May vs April".
  const monthsMeta  = factors?.spending_trend_months;
  const monthsLabel = monthsMeta
    ? formatTwoMonthLabel(monthsMeta.recent, monthsMeta.previous)
    : null;
  const trendSuffix = monthsLabel || 'vs prior month';
  const trendDesc =
    Math.abs(trendPct) <= 5 ? `Stable — ${trendSuffix}`
    : trendPct > 0 ? `Up ${trendPct.toFixed(0)}% — ${trendSuffix}`
    : `Down ${Math.abs(trendPct).toFixed(0)}% — ${trendSuffix}`;

  return [anomalyDesc, spendDesc, trendDesc];
}
function groupAnomalies(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.transactionId)) {
      map.set(row.transactionId, {
        transactionId: row.transactionId, ensembleScore: 0, status: 'Pending',
        detectedAt: row.detectedAt,
        algorithms: { isolationForest: false, zScore: false, lof: false, xgboost: false },
      });
    }
    const item = map.get(row.transactionId);
    if (row.algorithmName === 'Ensemble') {
      item.ensembleScore = row.score;
      item.status = row.status || 'Pending';
      item.detectedAt = row.detectedAt;
    } else {
      const key = ALGO_KEY_BY_BACKEND[row.algorithmName];
      if (key) item.algorithms[key] = row.isAnomaly;
    }
  }
  return Array.from(map.values());
}
function getSummaryTransactionCount(d) { return Number(d?.transactionCount ?? d?.totalTransactionCount ?? 0); }
function getSummaryAnomalyCount(d)     { return Number(d?.anomalyCount     ?? d?.totalAnomalyCount     ?? 0); }

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function getGreeting(name) {
  const h    = new Date().getHours();
  const base = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${base}, ${name}` : base;
}
function getFirstName(user) {
  if (!user) return '';
  if (user.firstName)  return user.firstName;
  if (user.first_name) return user.first_name;
  if (user.name)       return user.name.split(' ')[0];
  if (user.fullName)   return user.fullName.split(' ')[0];
  if (user.email)      return user.email.split('@')[0];
  return '';
}
function getNameFromToken() {
  try {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('afrats_token') ||
      sessionStorage.getItem('token');
    if (!token) return '';
    const payload = jwtDecode(token);
    return (
      payload.firstName ||
      payload.first_name ||
      payload.given_name ||
      payload.name?.split(' ')[0] ||
      payload.unique_name?.split(' ')[0] ||
      payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ||
      ''
    );
  } catch { return ''; }
}
// İlk yüklemede 0'dan hedefe çıkar (giriş animasyonu); sonraki güncellemelerde
// (poll ile gelen yeni skor) o an görüntülenen değerden yeniye yumuşakça akar —
// 0'a düşüp tekrar zıplamaz.
function useCountUp(target, duration = 1100) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = displayRef.current;
    const to   = Number(target) || 0;
    if (from === to) return undefined;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
      const val = from + (to - from) * eased;
      displayRef.current = val;
      setDisplay(val);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else { displayRef.current = to; setDisplay(to); }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return Math.round(display);
}

// ─────────────────────────────────────────────────────────────────────────────
// Global CSS
// ─────────────────────────────────────────────────────────────────────────────

function DashboardStyles() {
  return (
    <style>{`
      @keyframes af-fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      @keyframes af-pulse-ring { 0%{box-shadow:0 0 0 0 rgba(231,76,60,.4)} 70%{box-shadow:0 0 0 10px rgba(231,76,60,0)} 100%{box-shadow:0 0 0 0 rgba(231,76,60,0)} }
      @keyframes af-score-glow { 0%,100%{text-shadow:none} 50%{text-shadow:0 4px 20px rgba(231,76,60,.45)} }
      @keyframes af-blink      { 0%,100%{opacity:1} 50%{opacity:.25} }
      @keyframes af-bar        { from{width:0} }

      .af-enter   { animation: af-fadeUp 0.42s ease-out both; }
      .af-enter-1 { animation-delay:   0ms; }
      .af-enter-2 { animation-delay:  70ms; }
      .af-enter-3 { animation-delay: 140ms; }
      .af-enter-4 { animation-delay: 210ms; }

      .af-card {
        background:#fff; border:1px solid #e4e9ef; border-radius:14px;
        box-shadow:0 1px 3px rgba(15,23,42,.05),0 1px 2px rgba(15,23,42,.04);
        transition:box-shadow .2s ease,transform .2s ease;
      }
      .af-card:hover {
        box-shadow:0 6px 20px rgba(15,23,42,.09),0 2px 6px rgba(15,23,42,.05);
        transform:translateY(-2px);
      }
      .af-pulse-ring { animation:af-pulse-ring 2.2s ease-out infinite; }
      .af-score-high { animation:af-score-glow 2.8s ease-in-out infinite; }
      .af-live-dot   { animation:af-blink      1.6s ease-in-out infinite; }
      .af-bar-grow   { animation:af-bar .9s cubic-bezier(.34,1.56,.64,1) both; animation-delay:180ms; }

      /* ── Anomaly rows — single accent color, matching AnomalyList ── */
      .af-arow {
        transition:background .12s,border-left-color .12s;
        border-left:3px solid transparent;
        cursor:pointer;
      }
      .af-arow:hover { background:rgba(248,250,252,.9); border-left-color:${ANOMALY_COLOR}; }

      /* ── Month nav ── */
      .af-mnav {
        width:30px; height:30px; border-radius:8px;
        border:1.5px solid #e2e8f0; background:#fff;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; color:#475569;
        transition:background .14s,border-color .14s,box-shadow .14s;
      }
      .af-mnav:hover:not(:disabled) { background:#f8fafc; border-color:#94a3b8; box-shadow:0 1px 4px rgba(0,0,0,.07); }
      .af-mnav:disabled { opacity:.3; cursor:not-allowed; }

      /* ── Factor bars ── */
      .af-ftrack { height:4px; border-radius:3px; background:#e9ecef; overflow:hidden; }
      .af-ffill  { height:100%; border-radius:3px; transition:width .6s ease; }

      /* ── View all button ── */
      .af-viewall {
        display:inline-flex; align-items:center; gap:5px;
        font-size:12px; font-weight:600;
        color:var(--color-accent); background:var(--color-surface);
        border:2px solid var(--color-accent); border-radius:20px;
        padding:4px 13px; cursor:pointer;
        transition:background .14s,color .14s; white-space:nowrap;
      }
      .af-viewall:hover { background:var(--color-accent); color:#fff; }
    `}</style>
  );
}

// Local helpers for widget loading/empty/error states.
// These wrap the shared Skeleton / EmptyState primitives to preserve the
// 120px-tall layout the Dashboard cards expect.

function WidgetSkeleton({ height = 52 }) {
  return <Skeleton height={height} rounded={8} />;
}
function WidgetError({ message = 'Failed to load data' }) {
  return (
    <div style={{ height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-expense)', fontSize: 13 }}>
      <FiAlertTriangle size={20} /><span>{message}</span>
    </div>
  );
}
function WidgetEmpty({ message, icon: Icon = FiActivity }) {
  return (
    <EmptyState
      icon={<Icon size={22} />}
      title={message}
      style={{ padding: '20px 24px' }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RiskScoreWidget
// ─────────────────────────────────────────────────────────────────────────────

// RiskScoreWidget — v4 (modest-nash design tokens + bugün-rework risk metrics)
//   Sol: gauge + level pill (modest-nash UX korundu)
//   Sağ: işlem-bazlı sparkline (6-month bar yerine) + anlamlı factor yüzdeleri
function RiskScoreWidget({ current, history, anomalyRate }) {
  const rawScore = Math.round(Number(current.score || 0));
  const score    = useCountUp(rawScore, 1200);
  const level    = current.level || pickRiskLevel(rawScore);
  const color    = RISK_COLORS[level];
  const bgColor  = RISK_BG[level];
  const isHigh   = level === 'High';

  const gaugeData = {
    datasets: [{
      data: [rawScore, 100 - rawScore],
      backgroundColor: [color, '#f1f5f9'],
      borderWidth: 0, circumference: 180, rotation: 270,
    }],
  };
  const gaugeOpts = {
    responsive: true, maintainAspectRatio: false, cutout: '78%',
    animation: { duration: 1400, easing: 'easeOutQuart' },
    plugins: { tooltip: { enabled: false }, legend: { display: false } },
  };

  // history desc geliyor; soldan sağa zaman akışı için reverse.
  const recent = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return [...history].reverse().slice(-20);
  }, [history]);

  const sparkData = {
    labels: recent.map((_, i) => `#${i + 1}`),
    datasets: [{
      data: recent.map((h) => h.score),
      borderColor: '#1B4F72',
      backgroundColor: 'rgba(27,79,114,.08)',
      borderWidth: 2,
      tension: 0.32,
      pointRadius: recent.length <= 12 ? 3 : 0,
      pointHoverRadius: 5,
      pointBackgroundColor: recent.map((h) => RISK_COLORS[h.level] || '#1B4F72'),
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
      fill: true,
    }],
  };
  const sparkOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => `Transaction ${items[0].label}`,
          label: (ctx) => ` Score: ${Number(ctx.parsed.y).toFixed(1)}`,
        },
        padding: 8, backgroundColor: '#0f172a', titleColor: '#94a3b8', bodyColor: '#f8fafc',
        cornerRadius: 6, bodyFont: { size: 12, weight: '700' }, titleFont: { size: 11 }, displayColors: false,
      },
    },
    scales: { y: { display: false, min: 0, max: 100 }, x: { display: false } },
  };

  const trendDelta = recent.length > 1
    ? Math.round(recent[recent.length - 1].score - recent[0].score)
    : null;

  // Yeni anlamlı yüzdeler (RiskDetail ile birebir)
  const factors        = current.factors || {};
  const debtRatio      = Number(factors.debt_ratio ?? 0);
  const spendingTrend  = Number(factors.spending_trend ?? 1);
  const spendPct       = debtRatio * 100;
  const trendPct       = (spendingTrend - 1) * 100;
  const anomalyPct     = Number(anomalyRate ?? 0);
  const factorDesc     = describeDashboardFactors(factors, anomalyPct);

  const factorVisuals = [
    {
      label:  'Spending vs Income',
      valTxt: `${spendPct.toFixed(0)}%`,
      barPct: Math.min(spendPct, 200) / 2,
      desc:   factorDesc[1],
      color:  spendPct > 120 ? 'var(--color-expense)' : spendPct > 80 ? 'var(--color-warning-strong)' : 'var(--color-income)',
    },
    {
      label:  'Spending Trend',
      valTxt: `${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(0)}%`,
      barPct: Math.min(Math.abs(trendPct), 50) * 2,
      desc:   factorDesc[2],
      color:  Math.abs(trendPct) > 30 ? 'var(--color-expense)' : Math.abs(trendPct) > 10 ? 'var(--color-warning-strong)' : 'var(--color-income)',
    },
    {
      label:  'Anomaly Rate',
      valTxt: `${anomalyPct.toFixed(0)}%`,
      barPct: Math.min(anomalyPct, 100),
      desc:   factorDesc[0],
      color:  anomalyPct >= 30 ? 'var(--color-expense)' : anomalyPct >= 10 ? 'var(--color-warning-strong)' : 'var(--color-income)',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Left — gauge */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 200, height: 128 }}>
          <Doughnut data={gaugeData} options={gaugeOpts} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 }}>
            <div className={isHigh ? 'af-score-high' : ''} style={{ fontSize: 42, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px' }}>
              {score}
            </div>
          </div>
        </div>
        <div className={isHigh ? 'af-pulse-ring' : ''} style={{ marginTop: 12, padding: '5px 16px', borderRadius: 20, background: bgColor, border: `1.5px solid ${color}45`, display: 'flex', alignItems: 'center', gap: 7 }}>
          {isHigh && <span className="af-live-dot" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color }} />}
          <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '0.06em' }}>{level.toUpperCase()} RISK</span>
        </div>
        {trendDelta !== null && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500, color: trendDelta === 0 ? '#64748b' : trendDelta > 0 ? 'var(--color-expense)' : 'var(--color-income)' }}>
            {trendDelta === 0 && '↔ Stable over recent activity'}
            {trendDelta  > 0 && `↑ +${trendDelta} pts over last ${recent.length} txns`}
            {trendDelta  < 0 && `↓ ${trendDelta} pts over last ${recent.length} txns`}
          </div>
        )}
      </div>

      {/* Right — sparkline + factors */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Score history</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              {recent.length > 0 ? `Last ${recent.length} transactions` : 'No history yet'}
            </span>
          </div>
          <div style={{ height: 62 }}>
            {recent.length > 0 ? (
              <Line data={sparkData} options={sparkOpts} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#cbd5e1' }}>
                Risk history will appear after analyzed transactions.
              </div>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>Key factors</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {factorVisuals.map(({ label, valTxt, barPct, desc, color: c }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{valTxt}</span>
                </div>
                <div className="af-ftrack">
                  <div className="af-ffill af-bar-grow" style={{ width: `${barPct}%`, background: c }} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CategoryBreakdown
// ─────────────────────────────────────────────────────────────────────────────

function CategoryBreakdown({ data }) {
  const [hovered, setHovered] = useState(null);

  if (!data || data.length === 0)
    return <WidgetEmpty message="No expense data for this period." icon={FiPieChart} />;

  const total = data.reduce((s, c) => s + c.totalAmount, 0);

  const chartData = {
    labels: data.map((c) => c.categoryName),
    datasets: [{
      data: data.map((c) => c.totalAmount),
      backgroundColor: data.map((_, i) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]),
      borderWidth: 3, borderColor: '#fff', hoverBorderColor: '#fff', hoverOffset: 9,
    }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false, cutout: '66%',
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => ` ${formatCurrency(data[ctx.dataIndex].totalAmount)}  (${data[ctx.dataIndex].percentage}%)` },
        padding: 10, backgroundColor: '#0f172a', titleColor: '#94a3b8', bodyColor: '#f8fafc',
        cornerRadius: 8, bodyFont: { size: 13, weight: '700' }, titleFont: { size: 11 }, displayColors: false,
      },
    },
    onHover: (_, els) => setHovered(els.length ? els[0].index : null),
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'center' }}>
      <div style={{ height: 210 }}>
        <Doughnut data={chartData} options={opts} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.slice(0, 6).map((c, i) => (
          <div key={c.categoryName} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', borderRadius: 8, background: hovered === i ? `${CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}14` : 'transparent', transition: 'background .15s' }}>
            <div style={{ width: 9, height: 9, borderRadius: 3, background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length], flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.categoryName}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(c.totalAmount)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.percentage}%</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 8px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AnomalyTable
// ─────────────────────────────────────────────────────────────────────────────

function AnomalyTable({ items }) {
  const navigate   = useNavigate();
  const [hoveredId, setHoveredId] = useState(null);

  if (!items || items.length === 0)
    return <WidgetEmpty message="No recent anomalies detected." icon={FiShield} />;

  const COL_HEADS = ['Transaction', 'Category', 'Description', 'Amount', 'Score', 'Algorithms', 'Status', ''];

  return (
    <div style={{ margin: '-4px -18px -18px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E9EF' }}>
            {COL_HEADS.map((col, i) => (
              <th key={i} style={{
                padding: '10px 16px', textAlign: 'left',
                fontSize: 11, fontWeight: 700, color: '#94A3B8',
                textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
                ...(i === 7 && { width: 28 }),
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const isHovered = hoveredId === a.transactionId;
            return (
              <tr key={a.transactionId}
                onMouseEnter={() => setHoveredId(a.transactionId)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => navigate(`/anomalies/${a.transactionId}`)}
                className="af-arow"
                style={{ borderBottom: '1px solid #F1F5F9' }}
              >
                {/* Transaction — tx tarihi baskın, detectedAt küçük altta (AnomalyList ile aynı) */}
                <td style={{ padding: '12px 16px', fontSize: 12, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>
                    {formatDate(a.transactionDate || a.detectedAt)}
                  </div>
                  {a.transactionDate && (
                    <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 400, marginTop: 2 }}>
                      Detected {formatDate(a.detectedAt)}
                    </div>
                  )}
                </td>

                {/* Category */}
                <td style={{ padding: '12px 16px', maxWidth: 140 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {a.categoryName || '—'}
                  </span>
                </td>

                {/* Description */}
                <td style={{ padding: '12px 16px', maxWidth: 160 }}>
                  <span style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {a.description || '—'}
                  </span>
                </td>

                {/* Amount */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ANOMALY_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                    {a.amount != null ? formatCurrency(a.amount) : '—'}
                  </span>
                </td>

                {/* Score */}
                <td style={{ padding: '12px 16px' }}>
                  <ScoreBar score={a.ensembleScore} />
                </td>

                {/* Algorithms */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {ALGORITHMS.map((al) => (
                      <AlgoBadge key={al.key} active={a.algorithms[al.key]} label={al.shortName} />
                    ))}
                  </div>
                </td>

                {/* Status */}
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    ...(ANOMALY_STATUS_STYLES[a.status] || ANOMALY_STATUS_STYLES.Pending),
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  }}>
                    {ANOMALY_STATUS_LABELS[a.status] || a.status}
                  </span>
                </td>

                {/* Chevron */}
                <td style={{ padding: '12px 12px 12px 0' }}>
                  <FiChevronRight size={15} style={{ color: isHovered ? 'var(--color-secondary)' : 'var(--color-text-disabled)', transition: 'color .15s' }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();

  const { user } = useAuth();
  const firstName = getFirstName(user) || getNameFromToken();

  const [selectedMonth,  setSelectedMonth]  = useState(dayjs());
  const [, setEmptyMonthKeys] = useState(new Set());

  const [summary,     setSummary]     = useState({ data: null, loading: true, error: null });
  const [risk,        setRisk]        = useState({ data: null, loading: true, error: null });
  const [riskHistory, setRiskHistory] = useState({ data: null, loading: true, error: null });
  const [anomalies,   setAnomalies]   = useState({ data: null, loading: true, error: null });
  const [unread,      setUnread]      = useState({ data: null, loading: true, error: null });

  // ── Loaders (ilk yükleme + adaptif poll ortak kullanır) ───────────────────
  // `silent`: poll sırasında skeleton/hata flash'i olmasın diye loading'e
  // dokunmaz ve geçici hatada eldeki veriyi korur. `alive()`: unmount / ay
  // değişimi yarış durumunda eski cevabın state'i ezmesini engeller.
  // Dönüş: stabilite imzası — poller "veri hâlâ değişiyor mu?" kararını verir.
  const loadSummary = useCallback(async ({ silent = false, alive = () => true } = {}) => {
    const month = selectedMonth.month() + 1;
    const year  = selectedMonth.year();
    if (!silent) setSummary({ data: null, loading: true, error: null });
    try {
      const res = await transactionApi.getSummary(month, year);
      if (!alive()) return null;
      const d = res.data;
      if (getSummaryTransactionCount(d) === 0)
        setEmptyMonthKeys((prev) => new Set([...prev, selectedMonth.format('YYYY-MM')]));
      setSummary({ data: d, loading: false, error: null });
      return JSON.stringify([
        getSummaryTransactionCount(d), getSummaryAnomalyCount(d),
        d?.totalIncome ?? null, d?.totalExpense ?? null, d?.netBalance ?? null,
      ]);
    } catch (e) {
      if (alive() && !silent) setSummary({ data: null, loading: false, error: e });
      return 'summary-err';
    }
  }, [selectedMonth]);

  const loadRiskBundle = useCallback(async ({ silent = false, alive = () => true } = {}) => {
    if (!silent) {
      setRisk({ data: null, loading: true, error: null });
      setRiskHistory({ data: null, loading: true, error: null });
      setAnomalies({ data: null, loading: true, error: null });
    }

    const [riskRes, histRes, anomRes] = await Promise.allSettled([
      mlApi.getCurrentRisk(),
      mlApi.getRiskHistory(6),
      mlApi.getAnomalies({ page: 1, pageSize: 20 }),
    ]);
    if (!alive()) return null;

    if (riskRes.status === 'fulfilled') setRisk({ data: riskRes.value.data, loading: false, error: null });
    else if (!silent) setRisk({ data: null, loading: false, error: riskRes.reason });

    if (histRes.status === 'fulfilled')
      setRiskHistory({ data: Array.isArray(histRes.value.data) ? histRes.value.data : [], loading: false, error: null });
    else if (!silent) setRiskHistory({ data: null, loading: false, error: histRes.reason });

    // Anomalies + top-5 enrich (tx detayları). Hatada eldeki veriyi koru.
    let anomSig = 'anom-err';
    if (anomRes.status === 'fulfilled') {
      try {
        const grouped = groupAnomalies(anomRes.value.data?.items || []);
        const top5    = grouped.slice(0, 5);
        const txnRes  = await Promise.allSettled(top5.map((g) => transactionApi.getById(g.transactionId)));
        if (!alive()) return null;
        const enriched = top5.map((g, i) => {
          const txn = txnRes[i].status === 'fulfilled' ? txnRes[i].value.data : null;
          return {
            ...g,
            amount:          txn?.amount          ?? null,
            categoryName:    txn?.categoryName    ?? null,
            description:     txn?.description     ?? txn?.note ?? txn?.memo ?? null,
            transactionDate: txn?.transactionDate ?? null,
          };
        });
        const totalCount = anomRes.value.data?.totalCount || 0;
        setAnomalies({ data: { items: enriched, totalCount }, loading: false, error: null });
        anomSig = String(totalCount);
      } catch (e) {
        if (!silent) setAnomalies({ data: null, loading: false, error: e });
      }
    } else if (!silent) {
      setAnomalies({ data: null, loading: false, error: anomRes.reason });
    }

    const riskData = riskRes.status === 'fulfilled' ? riskRes.value.data : null;
    const histLen  = histRes.status === 'fulfilled' && Array.isArray(histRes.value.data) ? histRes.value.data.length : -1;
    return JSON.stringify([riskData?.score ?? null, riskData?.level ?? null, histLen, anomSig]);
  }, []);

  // ── İlk yükleme: summary (selectedMonth değişince yeniden) ─────────────────
  useEffect(() => {
    let alive = true;
    loadSummary({ silent: false, alive: () => alive });
    return () => { alive = false; };
  }, [loadSummary]);

  // ── İlk yükleme: risk + anomalies (mount) ─────────────────────────────────
  useEffect(() => {
    let alive = true;
    loadRiskBundle({ silent: false, alive: () => alive });
    return () => { alive = false; };
  }, [loadRiskBundle]);

  // ── Adaptif auto-refresh ──────────────────────────────────────────────────
  // Sessizce poll eder; veri STABLE_ROUNDS tur üst üste değişmezse polling
  // kendini durdurur (oturunca sonsuz istek yok). Sekmeye geri dönünce bir tur
  // daha dener — başka sayfada işlem yapıp dönülen senaryoyu da yakalar.
  useEffect(() => {
    let alive = true;
    let stable = 0;
    let lastSig = null;
    let id = null;

    const tick = async () => {
      const [sSig, rSig] = await Promise.all([
        loadSummary({ silent: true, alive: () => alive }),
        loadRiskBundle({ silent: true, alive: () => alive }),
      ]);
      if (!alive || sSig == null || rSig == null) return;
      const sig = `${sSig}|${rSig}`;
      if (sig === lastSig) {
        stable += 1;
        if (stable >= STABLE_ROUNDS && id) { clearInterval(id); id = null; }
      } else {
        stable = 0;
        lastSig = sig;
      }
    };

    const start = () => {
      if (id || !alive) return;
      stable = 0;
      lastSig = null;
      id = setInterval(tick, POLL_MS);
    };

    start();
    window.addEventListener('focus', start);

    return () => {
      alive = false;
      if (id) clearInterval(id);
      window.removeEventListener('focus', start);
    };
  }, [loadSummary, loadRiskBundle]);

  // ── Fetch: unread count (polled) ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await notificationApi.getUnreadCount();
        if (!cancelled) setUnread({ data: res.data, loading: false, error: null });
      } catch (e) {
        if (!cancelled) setUnread((p) => ({ ...p, loading: false, error: e }));
      }
    };
    fetch();
    const iv = setInterval(fetch, 60_000);
    window.addEventListener('focus', fetch);
    return () => { cancelled = true; clearInterval(iv); window.removeEventListener('focus', fetch); };
  }, []);

  // ── Month navigation ──────────────────────────────────────────────────────
  // Backend `availableMonths` (DESC sıralı YYYY-MM listesi) ile çalışır:
  //   - Boş ayları atlar (kullanıcı boş aya tıklamaz, doğrudan veri olan aya gider)
  //   - İlk transaction'dan öncesine gidemez (prev disable)
  //   - Hiç işlem yoksa prev tamamen disable
  const availableMonths = useMemo(
    () => summary.data?.availableMonths ?? [],
    [summary.data]
  );
  const currentMonthKey = selectedMonth.format('YYYY-MM');
  const isCurrentMonth  = useMemo(() => selectedMonth.isSame(dayjs(), 'month'), [selectedMonth]);

  // Seçili ay listede olmayabilir (yeni hesap, boş ayda durmuş vb.) — en yakın
  // eski/yeni elemanı bulan helper. List DESC sıralı: [2026-06, 2026-04, ...]
  const prevAvailableKey = useMemo(() => {
    if (!availableMonths.length) return null;
    const idx = availableMonths.indexOf(currentMonthKey);
    if (idx === -1) return availableMonths.find((m) => m < currentMonthKey) ?? null;
    return availableMonths[idx + 1] ?? null;
  }, [availableMonths, currentMonthKey]);

  const nextAvailableKey = useMemo(() => {
    if (!availableMonths.length) return null;
    const idx = availableMonths.indexOf(currentMonthKey);
    if (idx === -1) {
      // Current ay listede yok — en yakın yeni ay (listenin DESC olduğunu unutma)
      const newer = [...availableMonths].reverse().find((m) => m > currentMonthKey);
      return newer ?? null;
    }
    return idx > 0 ? availableMonths[idx - 1] : null;
  }, [availableMonths, currentMonthKey]);

  const goPrevMonth = () => {
    if (prevAvailableKey) setSelectedMonth(dayjs(`${prevAvailableKey}-01`));
  };
  const goNextMonth = () => {
    if (nextAvailableKey) setSelectedMonth(dayjs(`${nextAvailableKey}-01`));
    else if (!isCurrentMonth) setSelectedMonth(dayjs()); // güvenlik: zaten next disabled olmalı
  };

  const isPrevDisabled = summary.loading || !prevAvailableKey;

  const trends = useMemo(() => {
    if (!summary.data?.previousPeriod) return {};
    const p = summary.data.previousPeriod, c = summary.data;
    return {
      income:       buildTrend(c.totalIncome,             p.totalIncome,             true),
      expense:      buildTrend(c.totalExpense,            p.totalExpense,            false),
      balance:      buildTrend(c.netBalance,              p.netBalance,              true),
      transactions: buildTrend(getSummaryTransactionCount(c), getSummaryTransactionCount(p), true),
      anomalies:    buildTrend(getSummaryAnomalyCount(c),     getSummaryAnomalyCount(p),     false),
    };
  }, [summary.data]);

  const riskAccent = useMemo(() => {
    if (!risk.data) return 'var(--color-primary)';
    return RISK_COLORS[risk.data.level || pickRiskLevel(risk.data.score)];
  }, [risk.data]);

  // Anomaly rate (frontend): flagged / total recent txns.
  // ML §7.2 bug (factors.anomaly_weight her zaman 0) için workaround.
  const anomalyRate = useMemo(() => {
    const flagged = Number(anomalies.data?.totalCount ?? 0);
    const total   = Array.isArray(riskHistory.data) ? riskHistory.data.length : 0;
    if (!total) return 0;
    return Math.min((flagged / total) * 100, 100);
  }, [anomalies.data, riskHistory.data]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <DashboardStyles />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div className="af-page-enter af-stagger-1" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Dashboard
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)' }}>
                {getGreeting(firstName)}
              </span>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#cbd5e1', display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400 }}>
                {selectedMonth.format('MMMM YYYY')} financial overview
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Bell */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => navigate('/notifications')} title="Notifications"
                style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
                <FiBell size={16} />
              </button>
              {!unread.loading && (unread.data?.unreadCount ?? 0) > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--color-expense)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #f8fafc', pointerEvents: 'none' }}>
                  {unread.data.unreadCount > 9 ? '9+' : unread.data.unreadCount}
                </span>
              )}
            </div>

            {/* Month picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 11, padding: '3px 5px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
              <button className="af-mnav" onClick={goPrevMonth} disabled={isPrevDisabled} title={isPrevDisabled ? 'No data for earlier months' : 'Previous month'}>
                <FiChevronLeft size={13} />
              </button>
              {isCurrentMonth ? (
                <div style={{ position: 'relative', padding: '4px 12px', minWidth: 110, textAlign: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>{selectedMonth.format('MMM YYYY')}</span>
                  <span style={{ display: 'block', width: 18, height: 2, background: 'var(--color-primary)', borderRadius: 1, margin: '2px auto 0' }} />
                </div>
              ) : (
                <div style={{ padding: '4px 12px', minWidth: 110, textAlign: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{selectedMonth.format('MMM YYYY')}</span>
                  <span style={{ display: 'block', height: 2, margin: '2px auto 0' }} />
                </div>
              )}
              <button className="af-mnav" onClick={goNextMonth} disabled={isCurrentMonth} title={isCurrentMonth ? 'Already on current month' : 'Next month'}>
                <FiChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="af-page-enter af-stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
          <SummaryCard icon={FiTrendingUp}    label="Total Income"  value={summary.data ? formatCurrency(summary.data.totalIncome)  : '—'} valueColor="text-income" accentColor="#27AE60" trend={trends.income}       isLoading={summary.loading} isError={!!summary.error} />
          <SummaryCard icon={FiTrendingDown}  label="Total Expense" value={summary.data ? formatCurrency(summary.data.totalExpense) : '—'} valueColor="text-expense" accentColor="#E74C3C" trend={trends.expense}      isLoading={summary.loading} isError={!!summary.error} />
          <SummaryCard icon={FiDollarSign}    label="Net Balance"   value={summary.data ? formatCurrency(summary.data.netBalance)   : '—'} valueColor="text-primary" accentColor="#1B4F72" trend={trends.balance}      isLoading={summary.loading} isError={!!summary.error} />
          <SummaryCard icon={FiActivity}      label="Transactions"  value={summary.data ? getSummaryTransactionCount(summary.data).toLocaleString() : '—'}              accentColor="#2E86C1" trend={trends.transactions} isLoading={summary.loading} isError={!!summary.error} />
          <SummaryCard icon={FiAlertTriangle} label="Anomalies"     value={summary.data ? getSummaryAnomalyCount(summary.data) : '—'} valueColor="text-expense" accentColor="#E74C3C" trend={trends.anomalies}    isLoading={summary.loading} isError={!!summary.error} />
        </div>

        {/* Risk + Spending */}
        <div className="af-page-enter af-stagger-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Risk Score" subtitle="ML ensemble · Isolation Forest · Z-Score · LOF" accent={riskAccent}>
            {risk.loading || riskHistory.loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <WidgetSkeleton height={150} /><WidgetSkeleton height={70} />
              </div>
            ) : risk.error  ? <WidgetError />
              : !risk.data  ? <WidgetEmpty message="No risk score yet. Add transactions to trigger ML analysis." icon={FiCpu} />
              : <RiskScoreWidget current={risk.data} history={riskHistory.data || []} anomalyRate={anomalyRate} />
            }
          </Card>

          <Card title="Spending by Category" subtitle={selectedMonth.format('MMMM YYYY')} accent="var(--color-secondary)">
            {summary.loading && <WidgetSkeleton height={185} />}
            {summary.error   && <WidgetError />}
            {summary.data    && <CategoryBreakdown data={summary.data.categoryBreakdown} />}
          </Card>
        </div>

        {/* Recent Anomalies */}
        <Card
          className="af-page-enter af-stagger-4"
          title="Recent Anomalies"
          subtitle="Latest 5 flagged transactions"
          accent="linear-gradient(90deg, var(--color-accent), #9B59B6)"
          action={
            <button className="af-viewall" onClick={() => navigate('/anomalies')}>
              View all <FiArrowRight size={11} />
            </button>
          }
        >
          {anomalies.loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map((i) => <WidgetSkeleton key={i} height={44} />)}
            </div>
          )}
          {anomalies.error && <WidgetError />}
          {anomalies.data  && <AnomalyTable items={anomalies.data.items ?? []} />}
        </Card>

      </div>
    </>
  );
}
