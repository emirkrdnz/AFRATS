// src/pages/anomalies/AnomalyDetail.jsx
//
// Hero grid: 290px | 1fr | 270px
//   Left  : title → Category → Description → Date → Detected → Amount
//   Middle: Spending chart + avg reference line
//   Right : Score gauge (centered) → Ensemble (centered)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiArrowLeft, FiAlertTriangle, FiCheck, FiTag,
  FiCalendar, FiFileText, FiTrendingUp, FiActivity,
  FiShield, FiInfo,
} from 'react-icons/fi';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, ReferenceDot, CartesianGrid,
} from 'recharts';
import { toast } from 'react-toastify';

import mlApi          from '../../api/mlApi';
import transactionApi from '../../api/transactionApi';
import { extractErrorMessage } from '../../api/errorHelper';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { ANOMALY_STATUS_LABELS, ANOMALY_STATUS_STYLES } from '../../utils/statusStyles';
import Card from '../../components/Card';
import Skeleton from '../../components/Skeleton';
import ConfirmDialog  from '../../components/ConfirmDialog';
import { ALGORITHMS, ENSEMBLE_THRESHOLD } from '../../utils/anomalyAlgorithms';

/* ─── Tokens ──────────────────────────────────────────────────────────── */
const ANOMALY_COLOR  = 'var(--color-expense)';
const ANOMALY_LIGHT  = 'rgba(231,76,60,.07)';

/* ─── Helpers ─────────────────────────────────────────────────────────── */
// Per-transaction series (NOT date-bucketed): each transaction in the category
// is one point, ordered chronologically. Date bucketing collapsed everything
// onto one point when all transactions were entered on the same day.
function buildSeries(txns, anomalyTxn) {
  if (!Array.isArray(txns)) return [];
  const anomalyId = anomalyTxn?.id ?? anomalyTxn?.transactionId ?? null;

  const sorted = [...txns].sort((a, b) => {
    const da = new Date(a.transactionDate || a.date || 0).getTime();
    const db = new Date(b.transactionDate || b.date || 0).getTime();
    if (da !== db) return da - db;
    // Same day → fall back to createdAt so order is stable & meaningful.
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  return sorted.map((t, i) => ({
    label: `#${i + 1}`,
    amount: Math.abs(t.amount || 0),
    date: t.transactionDate || t.date || null,
    isAnomaly: anomalyId != null && t.id === anomalyId,
  }));
}

/* ─── Score gauge ─────────────────────────────────────────────────────── */
function ScoreGauge({ score }) {
  const pct = Math.round(score * 100);
  const r = 52, cx = 66, cy = 62;
  const arc  = (pct / 100) * Math.PI * r;
  const circ = Math.PI * r;
  return (
    <div style={{ textAlign:'center' }}>
      <svg width="132" height="72" viewBox="0 0 132 72">
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="#F1F5F9" strokeWidth="11" strokeLinecap="round"/>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={ANOMALY_COLOR} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          style={{ transition:'stroke-dasharray 1.1s cubic-bezier(.34,1.56,.64,1)' }}
        />
      </svg>
      <div style={{ marginTop:-8, fontSize:38, fontWeight:900, color:ANOMALY_COLOR, letterSpacing:'-2px', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>
        {pct}
      </div>
      <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:5 }}>
        Anomaly Score
      </div>
    </div>
  );
}

/* ─── Info row ────────────────────────────────────────────────────────── */
function InfoRow({ icon:Icon, label, value }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'7px 0', borderBottom:'1px solid #F8FAFC' }}>
      <div style={{ width:26, height:26, borderRadius:6, background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
        <Icon size={12} style={{ color:'#64748B' }}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--color-text)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value || '—'}</div>
      </div>
    </div>
  );
}

/* ─── Score composition + most influential ────────────────────────────
   Weighted-sum decision is opaque if shown as "X/4 flagged". This component
   visualises each algorithm's contribution (score × weight) as a stacked bar
   so the user can see *which algorithm carried the verdict*.

   `algorithmResults` = backend's per-algorithm output.
   `finalScore`       = ensemble.finalScore (already weighted-summed server-side).
*/
function computeContributions(algorithmResults) {
  return ALGORITHMS.map((a) => {
    const r = algorithmResults?.[a.key];
    const score = Number(r?.score ?? 0);
    const skipped = !!r?.metrics?.skipped;
    return {
      ...a,
      score,
      contribution: skipped ? 0 : score * a.weight,
      isAnomaly: !!r?.isAnomaly,
      skipped,
      metrics: r?.metrics ?? {},
      hasResult: !!r && !skipped,
    };
  });
}

// Shared analysis — ranked contributions + "most influential" copy.
function analyzeContribs(algorithmResults, finalScore) {
  const contribs = computeContributions(algorithmResults);
  const total = contribs.reduce((s, c) => s + c.contribution, 0);
  const isAnomaly = finalScore >= ENSEMBLE_THRESHOLD;

  const ranked = contribs
    .map((c) => ({ ...c, share: total > 0 ? c.contribution / total : 0 }))
    .sort((a, b) => b.share - a.share);

  let influenceLine = null;
  if (total > 0) {
    if (ranked[0].share >= 0.60) {
      influenceLine = (
        <>Primarily driven by <strong>{ranked[0].name}</strong> ({Math.round(ranked[0].share * 100)}%)</>
      );
    } else {
      influenceLine = (
        <>Most influential: <strong>{ranked[0].name}</strong> ({Math.round(ranked[0].share * 100)}%) · <strong>{ranked[1].name}</strong> ({Math.round(ranked[1].share * 100)}%)</>
      );
    }
  }

  return { contribs, isAnomaly, influenceLine };
}

// Per-algorithm explainer: one-line "what it does" + the metrics the backend
// returns in algorithmResults[key].metrics.
const ALGO_INFO = {
  xgboost: {
    desc: 'Trained on labelled history — outputs the probability this resembles past anomalies.',
    metrics: [
      { label: 'Probability', key: 'probability', fmt: (v) => v.toFixed(4) },
      { label: 'Threshold',   key: 'threshold',   fmt: (v) => v.toFixed(2) },
    ],
  },
  zScore: {
    desc: "How many standard deviations the amount sits from this user's average spend.",
    metrics: [
      { label: 'User Mean',   key: 'userMean',   fmt: (v) => formatCurrency(v) },
      { label: 'User StdDev', key: 'userStdDev', fmt: (v) => formatCurrency(v) },
      { label: 'Threshold',   key: 'threshold',  fmt: (v) => v.toFixed(2) },
    ],
  },
  isolationForest: {
    desc: 'Scores how easily this transaction isolates from the rest — outliers split off in fewer steps.',
    metrics: [
      { label: 'Isolation Depth', key: 'isolationDepth',    fmt: (v) => v.toFixed(2) },
      { label: 'Avg Path Length', key: 'averagePathLength', fmt: (v) => v.toFixed(2) },
      { label: 'Contamination',   key: 'contamination',     fmt: (v) => v.toFixed(3) },
    ],
  },
  lof: {
    desc: "Compares this point's local density to its neighbours — sparse surroundings score higher.",
    metrics: [
      { label: 'Density Ratio', key: 'localDensityRatio', fmt: (v) => v.toFixed(3) },
      { label: 'k Neighbors',   key: 'kNeighbors',        fmt: (v) => String(v) },
      { label: 'Threshold',     key: 'threshold',         fmt: (v) => v.toFixed(2) },
    ],
  },
};

// Hero right-panel — compact Score Composition: weighted stacked bar +
// weight/contribution under each segment + the one-line "driven by" answer.
// Full per-algorithm detail lives in the AlgorithmBreakdown card below the hero.
function VerdictSummary({ algorithmResults, finalScore }) {
  const { contribs, influenceLine } = analyzeContribs(algorithmResults, finalScore);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)', marginBottom: 10 }}>
        Score Composition
      </div>

      {/* Stacked bar — segment width ∝ weight; min 38px keeps low-weight LOF readable */}
      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        {contribs.map((c) => {
          const flagged = c.isAnomaly && !c.skipped;
          const bg = flagged
            ? `rgba(231,76,60,${Math.max(0.25, c.score)})`
            : `rgba(148,163,184,${Math.max(0.18, c.score * 0.5)})`;
          return (
            <div
              key={c.key}
              style={{
                flexGrow: c.weight, flexBasis: 0, minWidth: 38,
                background: bg, borderRight: '1px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
                color: flagged && c.score > 0.5 ? '#fff' : '#475569',
              }}
            >
              {c.shortName}
            </div>
          );
        })}
      </div>

      {/* weight + contribution under each segment (same flex pattern) */}
      <div style={{ display: 'flex', marginTop: 5 }}>
        {contribs.map((c) => (
          <div key={c.key} style={{ flexGrow: c.weight, flexBasis: 0, minWidth: 38, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>{c.weight.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{c.contribution.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Driven by — the one-line "why is this an anomaly" answer */}
      {influenceLine && (
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginTop: 12, textAlign: 'center' }}>
          {influenceLine}
        </div>
      )}
    </div>
  );
}

// Below-hero card — full per-algorithm breakdown: each algorithm's
// score × weight = contribution, its metrics, who fired (flagged/normal/
// skipped), then the running total = final ensemble score.
function AlgorithmBreakdown({ algorithmResults, finalScore }) {
  const { contribs } = analyzeContribs(algorithmResults, finalScore);
  const total = contribs.reduce((s, c) => s + c.contribution, 0);
  const isAnomaly = finalScore >= ENSEMBLE_THRESHOLD;
  const totalColor = isAnomaly ? 'var(--color-expense)' : 'var(--color-income)';

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)' }}>Algorithm Breakdown</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
          Each algorithm's score × weight = contribution. The sum is the final ensemble score.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {contribs.map((c) => {
          const info = ALGO_INFO[c.key] || { desc: '', metrics: [] };
          const flagged = c.isAnomaly && !c.skipped;
          const color = c.skipped ? '#94A3B8' : flagged ? 'var(--color-expense)' : 'var(--color-income)';
          return (
            <div key={c.key} style={{ border: '1px solid #E4E9EF', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ height: 3, background: c.skipped ? '#E2E8F0' : color }} />
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 28, borderRadius: 7, fontSize: 11, fontWeight: 800, flexShrink: 0,
                      background: c.skipped ? '#F1F5F9' : color, color: c.skipped ? '#94A3B8' : '#fff',
                    }}>
                      {c.shortName}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>{c.type} · {(c.weight * 100).toFixed(0)}% weight</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
                    {c.skipped ? 'skipped' : flagged ? '⚠ flagged' : '✓ normal'}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, marginBottom: 12 }}>{info.desc}</div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 6, padding: '8px 10px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 8, marginBottom: c.skipped ? 0 : 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Score</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{c.score.toFixed(2)}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#CBD5E1' }}>×</span>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Weight</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{c.weight.toFixed(2)}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#CBD5E1' }}>=</span>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Contribution</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color, fontVariantNumeric: 'tabular-nums' }}>{c.contribution.toFixed(3)}</div>
                  </div>
                </div>

                {c.skipped ? (
                  <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', paddingTop: 10 }}>
                    Model unavailable server-side — contributes 0.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {info.metrics.map((row) => (
                      <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>{row.label}</span>
                        <span style={{ fontSize: 11, fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: '#374151' }}>
                          {c.metrics?.[row.key] != null ? row.fmt(c.metrics[row.key]) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Running total = final ensemble score */}
      <div style={{
        marginTop: 16, padding: '14px 18px', borderRadius: 12,
        border: `1px solid ${isAnomaly ? 'rgba(231,76,60,.25)' : 'rgba(39,174,96,.25)'}`,
        background: isAnomaly ? 'rgba(231,76,60,.06)' : 'rgba(39,174,96,.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>Sum of contributions</span>
          <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'ui-monospace,monospace', fontVariantNumeric: 'tabular-nums' }}>
            {contribs.map((c) => c.contribution.toFixed(2)).join(' + ')} =
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'ui-monospace,monospace', color: totalColor, fontVariantNumeric: 'tabular-nums' }}>
            {total.toFixed(2)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: totalColor }}>
            → {isAnomaly ? 'ANOMALY' : 'NORMAL'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   AnomalyDetail
═══════════════════════════════════════════════════════════════════════ */
export default function AnomalyDetail() {
  const { transactionId: id } = useParams();
  const navigate = useNavigate();
  const autoReviewRef = useRef(false);

  const [detail,        setDetail]        = useState(null);
  const [txn,           setTxn]           = useState(null);
  const [series,        setSeries]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [statusBusy,    setStatusBusy]    = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dr, tr] = await Promise.all([mlApi.getAnomalyDetail(id), transactionApi.getById(id)]);
      setDetail(dr.data); setTxn(tr.data);
      if (tr.data?.categoryId) {
        // Per-transaction view → no date window; pull the latest 100 in this
        // category (backend clamps pageSize to 100 and sorts desc).
        try {
          const h = await transactionApi.getAll({
            categoryId: tr.data.categoryId,
            type: 'Expense',
            pageSize: 100,
          });
          setSeries(buildSeries(h.data?.items || [], tr.data));
        } catch { setSeries([]); }
      }
    } catch (err) { setError(extractErrorMessage(err) || 'Failed to load anomaly.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (detail?.status === 'Pending' && !autoReviewRef.current) {
      autoReviewRef.current = true;
      mlApi.updateAnomalyStatus(id, 'Reviewed')
        .then(() => setDetail(p => p ? {...p, status:'Reviewed'} : p))
        .catch(() => {});
    }
  }, [detail, id]);

  const handleStatus = async (newStatus) => {
    setStatusBusy(true);
    try {
      await mlApi.updateAnomalyStatus(id, newStatus);
      setDetail(p => p ? {...p, status:newStatus} : p);
    } catch (err) { toast.error(extractErrorMessage(err, 'Could not update status.')); }
    finally { setStatusBusy(false); setPendingAction(null); }
  };

  const isFinal = detail?.status === 'Confirmed' || detail?.status === 'FalsePositive';

  /* ── Loading ────────────────────────────────────────────────────── */
  if (loading) return (
    <>
      <div style={{ display:'flex', flexDirection:'column', gap:14, padding:'4px 0' }}>
        <Skeleton width={110} height={16}/>
        <Card accent="#E2E8F0" style={{ borderRadius: 14 }} bodyStyle={{ padding: 24 }}>
          <div style={{ display:'grid', gridTemplateColumns:'290px 1fr 440px', gap:24 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Skeleton width="80%" height={20}/>
              <Skeleton width="50%" height={14}/>
              <Skeleton/>
              <Skeleton/>
              <Skeleton width="70%"/>
              <Skeleton width="50%" height={28}/>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Skeleton height={32}/>
              <Skeleton height={140}/>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
              <Skeleton width={132} height={80} rounded={8}/>
              <Skeleton width="80%"/>
              <Skeleton width="60%" height={22}/>
            </div>
          </div>
        </Card>
      </div>
    </>
  );

  if (error || !detail) return (
    <div style={{ padding:'64px 0', textAlign:'center' }}>
      <FiAlertTriangle size={24} style={{ color:'var(--color-expense)', marginBottom:12 }}/>
      <p style={{ fontSize:14, fontWeight:600, color:'var(--color-expense)', margin:'0 0 6px' }}>
        {error?.includes('not found') ? 'This transaction no longer exists.' : error || 'Anomaly not found.'}
      </p>
      <p style={{ fontSize:12, color:'#94A3B8', margin:'0 0 14px' }}>
        {error?.includes('not found') ? 'The underlying transaction was deleted. This anomaly record will be removed automatically.' : ''}
      </p>
      <button onClick={()=>navigate('/anomalies')} style={{ fontSize:13, color:'var(--color-secondary)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>← Back</button>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes af-fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bar-grow{from{width:0}to{}}
        @keyframes af-pulse{0%{box-shadow:0 0 0 0 rgba(231,76,60,.4)}70%{box-shadow:0 0 0 8px rgba(231,76,60,0)}100%{box-shadow:0 0 0 0 rgba(231,76,60,0)}}
        .e1{animation:af-fadeUp .45s cubic-bezier(.22,1,.36,1) both;animation-delay:0ms}
        .e2{animation:af-fadeUp .45s cubic-bezier(.22,1,.36,1) both;animation-delay:40ms}
        .e3{animation:af-fadeUp .45s cubic-bezier(.22,1,.36,1) both;animation-delay:80ms}
        .e4{animation:af-fadeUp .45s cubic-bezier(.22,1,.36,1) both;animation-delay:140ms}
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:14, padding:'4px 0' }}>

        {/* Back */}
        <div className="e1">
          <button onClick={()=>navigate('/anomalies')} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'#64748B', background:'none', border:'none', cursor:'pointer', padding:0, transition:'color .15s' }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--color-primary)'}
            onMouseLeave={e=>e.currentTarget.style.color='#64748B'}
          >
            <FiArrowLeft size={15}/> Back to anomalies
          </button>
        </div>

        {/* ACTION BAR */}
        <div className="e2" style={{ animationDelay:'40ms' }}>
          {isFinal ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--color-surface)', borderRadius:12, border:'1px solid var(--color-border)', padding:'12px 18px', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, flexShrink:0, background:'#F8FAFC', border:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {detail.status === 'Confirmed'
                    ? <FiShield size={15} style={{ color:'#94A3B8' }}/>
                    : <FiCheck size={15} style={{ color:'#94A3B8' }}/>
                  }
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text)' }}>
                    {detail.status === 'Confirmed' ? 'Confirmed as genuine anomaly' : 'Marked as false positive'}
                  </div>
                  <div style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>
                    {detail.status === 'Confirmed' ? 'This transaction has been confirmed and recorded.' : 'This alert has been dismissed. No further action needed.'}
                  </div>
                </div>
              </div>
              <button onClick={()=>setPendingAction(detail.status === 'Confirmed' ? 'FalsePositive' : 'Confirmed')} style={{ padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'transparent', border:'1.5px solid #E2E8F0', color:'#64748B', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}
                onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              >
                Change decision
              </button>
            </div>
          ) : (
            <div style={{ background:'var(--color-surface)', borderRadius:12, border:'1.5px solid var(--color-border)', overflow:'hidden', boxShadow:'0 2px 10px rgba(15,23,42,.06)' }}>
              <div style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', background:'var(--color-surface)', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid #E2E8F0' }}>
                    <FiInfo size={13} style={{ color:'#94A3B8' }}/>
                  </div>
                  <div>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--color-text)' }}>Your assessment is needed</span>
                    <span style={{ fontSize:12, color:'#94A3B8', marginLeft:8 }}>Review and take action</span>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <button onClick={()=>setPendingAction('Confirmed')} disabled={statusBusy} style={{ padding:'6px 14px', borderRadius:7, fontSize:12, fontWeight:700, background:'var(--color-surface)', color:'#64748B', border:'1.5px solid #E2E8F0', cursor:'pointer' }}>
                    Confirm
                  </button>
                  <button onClick={()=>setPendingAction('FalsePositive')} disabled={statusBusy} style={{ padding:'6px 14px', borderRadius:7, fontSize:12, fontWeight:700, background:'var(--color-surface)', color:'#64748B', border:'1.5px solid #E2E8F0', cursor:'pointer' }}>
                    False Positive
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* HERO */}
        <div className="e3" style={{ animationDelay:'80ms', background:'var(--color-surface)', borderRadius:14, border:'1px solid var(--color-border)', overflow:'hidden', boxShadow:'0 1px 8px rgba(15,23,42,.06)' }}>
          <div style={{ height:4, background:'linear-gradient(90deg, var(--color-accent), #9B59B6)' }}/>

          <div style={{ display:'grid', gridTemplateColumns:'290px 1fr 440px' }}>

            {/* LEFT */}
            <div style={{ padding:'20px 18px', borderRight:'1px solid #F1F5F9', minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
                <div style={{ width:36, height:36, borderRadius:9, flexShrink:0, background:ANOMALY_LIGHT, display:'flex', alignItems:'center', justifyContent:'center', animation:'af-pulse 2.5s infinite' }}>
                  <FiAlertTriangle size={17} style={{ color:ANOMALY_COLOR }}/>
                </div>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, color:'var(--color-text)', letterSpacing:'-0.3px' }}>Anomaly Detected</div>
                  <div style={{ marginTop:5 }}>
                    <span style={{ ...ANOMALY_STATUS_STYLES[detail.status], padding:'3px 8px', borderRadius:6, fontSize:11, fontWeight:700 }}>
                      {ANOMALY_STATUS_LABELS[detail.status]}
                    </span>
                  </div>
                </div>
              </div>

              <InfoRow icon={FiTag}      label="Category"         value={txn?.categoryName}/>
              <InfoRow icon={FiFileText} label="Description"      value={txn?.description}/>
              <InfoRow icon={FiCalendar} label="Transaction Date" value={formatDate(txn?.transactionDate || txn?.date)}/>
              <InfoRow icon={FiActivity} label="Detected"         value={formatDateTime(detail.detectedAt)}/>

              <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid #F8FAFC' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Amount</div>
                <div style={{ fontSize:30, fontWeight:900, color:'var(--color-text)', fontVariantNumeric:'tabular-nums', letterSpacing:'-1px' }}>
                  {txn?.amount != null ? formatCurrency(txn.amount) : '—'}
                </div>
              </div>
            </div>

            {/* MIDDLE */}
            <div style={{ padding:'18px 14px', borderRight:'1px solid #F1F5F9', display:'flex', flexDirection:'column', minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <FiTrendingUp size={13} style={{ color:'var(--color-secondary)' }}/>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--color-text)' }}>Spending Context</div>
                    <div style={{ fontSize:10, color:'#94A3B8' }}>
                      {series.length} transaction{series.length !== 1 ? 's' : ''} · {txn?.categoryName || 'Category'}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#64748B' }}>
                    <span style={{ width:14, height:2, background:'var(--color-secondary)', borderRadius:1 }}/> Amount
                  </span>
                  <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--color-expense)' }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--color-expense)', border:'1.5px solid #fff', boxShadow:'0 0 0 1.5px var(--color-expense)' }}/> Anomaly
                  </span>
                </div>
              </div>

              <div style={{ flex:1, minHeight:118 }}>
                {series.length === 0 ? (
                  <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                    <FiTrendingUp size={20} style={{ color:'#E2E8F0', marginBottom:8 }}/>
                    <p style={{ fontSize:12, color:'#94A3B8', margin:0 }}>No spending history.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top:12, right:8, left:0, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F8FAFC" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:9, fill:'#94A3B8' }} interval={Math.floor(series.length/5)} minTickGap={12} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:9, fill:'#94A3B8' }} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={28}/>
                      <Tooltip formatter={v=>[formatCurrency(v),'Amount']}
                        labelFormatter={(label, payload) => {
                          const d = payload?.[0]?.payload?.date;
                          return d ? `${label} · ${formatDate(d)}` : label;
                        }}
                        contentStyle={{ background:'#0f172a', border:'none', borderRadius:7, padding:'7px 10px', fontSize:12, fontWeight:700, color:'#f8fafc' }}
                        labelStyle={{ fontSize:10, color:'#94a3b8', marginBottom:2 }}/>
                      {/* TODO 2C: recharts SVG paint attrs; verify CSS-variable support before tokenizing */}
                      <Line type="monotone" dataKey="amount" stroke="#2E86C1" strokeWidth={2} dot={false}
                        activeDot={{ r:4, fill:'#2E86C1', stroke:'#fff', strokeWidth:2 }}/>
                      {series.filter(p=>p.isAnomaly).map(p=>(
                        <ReferenceDot key={p.label} x={p.label} y={p.amount} r={6} fill="#E74C3C" stroke="#fff" strokeWidth={2}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* RIGHT */}
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:0, minWidth:0 }}>
              <ScoreGauge score={detail.anomalyScore}/>

              <div style={{ width:'100%', height:1, background:'#F1F5F9', margin:'12px 0' }}/>

              <VerdictSummary
                algorithmResults={detail.algorithmResults}
                finalScore={detail.ensemble?.finalScore ?? detail.anomalyScore ?? 0}
              />
            </div>

          </div>
        </div>

        {/* ALGORITHM BREAKDOWN — separate card below the hero */}
        <div className="e4" style={{ background:'var(--color-surface)', borderRadius:14, border:'1px solid var(--color-border)', overflow:'hidden', boxShadow:'0 1px 8px rgba(15,23,42,.06)' }}>
          <div style={{ height:4, background:'linear-gradient(90deg, var(--color-accent), #9B59B6)' }}/>
          <div style={{ padding:'18px 22px' }}>
            <AlgorithmBreakdown
              algorithmResults={detail.algorithmResults}
              finalScore={detail.ensemble?.finalScore ?? detail.anomalyScore ?? 0}
            />
          </div>
        </div>

      </div>

      <ConfirmDialog
        open={!!pendingAction}
        title={pendingAction === 'Confirmed' ? 'Confirm this anomaly?' : 'Mark as false positive?'}
        message={pendingAction === 'Confirmed'
          ? 'This marks the transaction as a confirmed anomaly.'
          : 'This dismisses the alert. You can change your decision later.'}
        confirmLabel={pendingAction === 'Confirmed' ? 'Confirm Anomaly' : 'Mark False Positive'}
        onConfirm={()=>handleStatus(pendingAction)}
        onCancel={()=>setPendingAction(null)}
        variant={pendingAction === 'Confirmed' ? 'danger' : 'default'}
        isLoading={statusBusy}
      />
    </>
  );
}