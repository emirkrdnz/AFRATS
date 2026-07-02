// src/pages/anomalies/AnomalyList.jsx
// Columns: Date | Category | Description | Amount | Score | Algorithms | Status
// Status changes: AnomalyDetail only. No bulk actions, no checkboxes.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiAlertTriangle, FiFilter, FiChevronRight } from 'react-icons/fi';

import mlApi          from '../../api/mlApi';
import transactionApi from '../../api/transactionApi';
import { extractErrorMessage } from '../../api/errorHelper';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ANOMALY_STATUS_LABELS, ANOMALY_STATUS_STYLES } from '../../utils/statusStyles';

import AnomalyFilters from './AnomalyFilters';
import Pagination     from '../../components/Pagination';
import Card           from '../../components/Card';
import { SkeletonRow } from '../../components/Skeleton';
import EmptyState     from '../../components/EmptyState';
import AlgoBadge      from '../../components/anomaly/AlgoBadge';
import ScoreBar       from '../../components/anomaly/ScoreBar';
import { ALGORITHMS, ALGO_KEY_BY_BACKEND } from '../../utils/anomalyAlgorithms';

const PAGE_SIZE = 20;

// Single accent color for all anomalies (this is an "anomaly list" — all rows are flagged)
const ANOMALY_COLOR = 'var(--color-expense)';

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function groupAnomalies(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.transactionId)) {
      map.set(row.transactionId, {
        transactionId: row.transactionId,
        ensembleScore: 0,
        status: 'Pending',
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

function applyFilters(items, filters) {
  return items.filter((item) => {
    if (filters.algorithm) {
      const algos = filters.algorithm.split(',').filter(Boolean);
      if (algos.length > 0 && !algos.some((a) => item.algorithms[a])) return false;
    }
    if (filters.dateFrom && new Date(item.detectedAt) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo) {
      const end = new Date(filters.dateTo); end.setHours(23,59,59,999);
      if (new Date(item.detectedAt) > end) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const cat  = (item.txn?.categoryName || '').toLowerCase();
      const desc = (item.txn?.description  || '').toLowerCase();
      if (!cat.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   AnomalyList
═══════════════════════════════════════════════════════════════════════ */
export default function AnomalyList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page    = parseInt(searchParams.get('page') || '1', 10);
  const filters = {
    search:    searchParams.get('search')    || undefined,
    status:    searchParams.get('status')    || undefined,
    algorithm: searchParams.get('algorithm') || undefined,
    dateFrom:  searchParams.get('dateFrom')  || undefined,
    dateTo:    searchParams.get('dateTo')    || undefined,
  };

  const [items,       setItems]       = useState([]);
  const [totalCount,  setTotalCount]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredId,   setHoveredId]   = useState(null);

  /* ── Fetch ──────────────────────────────────────────────────────── */
  const fetchAnomalies = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Backend returns 5 rows per txn (IF + Z + LOF + XGB + Ensemble); request
      // enough rows to fill the page after grouping.
      const params = { page, pageSize: PAGE_SIZE * 5 };
      if (filters.status) params.status = filters.status;
      const res  = await mlApi.getAnomalies(params);
      const { items: rows = [], totalCount: total = 0 } = res.data || {};
      const grouped = groupAnomalies(rows);
      const txnRes  = await Promise.allSettled(grouped.map((g) => transactionApi.getById(g.transactionId)));
      grouped.forEach((g, i) => { g.txn = txnRes[i].status === 'fulfilled' ? txnRes[i].value.data : null; });
      const valid = grouped.filter(g => g.txn !== null);
      // Newest detection first. DetectedAt can tie when many txns are processed
      // together (same-day data), so fall back to the transaction's createdAt /
      // transactionDate to keep the most recently entered ones on top.
      valid.sort((a, b) => {
        const da = new Date(a.detectedAt || 0).getTime();
        const db = new Date(b.detectedAt || 0).getTime();
        if (db !== da) return db - da;
        const ca = new Date(a.txn?.createdAt || a.txn?.transactionDate || 0).getTime();
        const cb = new Date(b.txn?.createdAt || b.txn?.transactionDate || 0).getTime();
        return cb - ca;
      });
      setItems(valid);
      const approxTxns = Math.ceil(total / 5);
      setTotalCount(approxTxns);
    } catch (err) {
      setError(extractErrorMessage(err) || 'Failed to load anomalies.');
      setItems([]); setTotalCount(0);
    } finally { setLoading(false); }
  }, [page, filters.status]); // eslint-disable-line

  useEffect(() => { fetchAnomalies(); }, [fetchAnomalies]);

  /* ── Params ─────────────────────────────────────────────────────── */
  const updateParams = (patch, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k); else next.set(k, String(v));
    }
    if (resetPage) next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const handleFilterChange = (patch) => updateParams(patch, true);
  const handleResetFilters = () => { setSearchParams({}, { replace: true }); };
  const handlePageChange   = (p) => updateParams({ page: p > 1 ? p : null }, false);

  /* ── Filtered view ──────────────────────────────────────────────── */
  const filteredItems = useMemo(
    () => applyFilters(items, filters),
    [items, filters]
  );

  const hasAdvFilter = filters.search || filters.algorithm || filters.dateFrom || filters.dateTo;

  /* ─── Render ────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes af-fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .af-e1{animation:af-fadeUp .45s cubic-bezier(.22,1,.36,1) both;animation-delay:0ms}
        .af-e2{animation:af-fadeUp .45s cubic-bezier(.22,1,.36,1) both;animation-delay:70ms}
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>

        {/* Page title */}
        <div className="af-e1">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.5px' }}>Anomalies</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Transactions flagged by the ML ensemble — review and confirm.
          </p>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="af-e1">
            <AnomalyFilters filters={filters} onChange={handleFilterChange} onReset={handleResetFilters} />
          </div>
        )}

        {/* ══ Widget card ═══════════════════════════════════════════ */}
        <Card
          className="af-e2"
          accent="linear-gradient(90deg, var(--color-accent), #9B59B6)"
          hover
          title="Anomaly List"
          subtitle={loading ? 'Loading…' : `${filteredItems.length} flagged transaction${filteredItems.length !== 1 ? 's' : ''}`}
          action={
            <button onClick={() => setShowFilters(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'all .15s',
              border: `2px solid ${showFilters || hasAdvFilter ? 'var(--color-accent)' : '#E2E8F0'}`,
              background: showFilters || hasAdvFilter ? 'var(--color-accent)' : 'transparent',
              color: showFilters || hasAdvFilter ? '#fff' : '#64748B',
            }}>
              <FiFilter size={11} />
              Filters
              {hasAdvFilter && <span style={{ width: 6, height: 6, borderRadius: '50%', background: showFilters ? 'rgba(255,255,255,.6)' : 'var(--color-accent)' }} />}
            </button>
          }
          bodyStyle={{ padding: 0 }}
        >
          {/* Table */}
          {loading ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>{Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} columns={7} />)}</tbody>
            </table>
          ) : error ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <FiAlertTriangle size={26} style={{ color: 'var(--color-expense)', marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: 'var(--color-expense)', margin: 0 }}>{error}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={<FiAlertTriangle size={22} />}
              title={totalCount === 0 ? 'No anomalies detected yet' : 'No results match the filters'}
              description={totalCount === 0 ? 'Anomalies will appear here as transactions are analysed.' : 'Try adjusting the filters above.'}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-subtle)', borderBottom: '1px solid var(--color-border)' }}>
                  {['Transaction', 'Category', 'Description', 'Amount', 'Score', 'Algorithms', 'Status', ''].map((col, i) => (
                    <th key={i} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
                      ...(i === 7 && { width: 28 }),
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isHovered = hoveredId === item.transactionId;
                  return (
                    <tr key={item.transactionId}
                      onMouseEnter={() => setHoveredId(item.transactionId)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => navigate(`/anomalies/${item.transactionId}`)}
                      style={{
                        borderBottom: '1px solid var(--color-divider)',
                        borderLeft: isHovered ? `3px solid ${ANOMALY_COLOR}` : '3px solid transparent',
                        background: isHovered ? 'rgba(248,250,252,.9)' : 'transparent',
                        cursor: 'pointer', transition: 'background .12s, border-left .12s',
                      }}
                    >
                      {/* Date — transaction tarihi baskın, detectedAt küçük alt satır */}
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                          {item.txn?.transactionDate ? formatDate(item.txn.transactionDate) : formatDate(item.detectedAt)}
                        </div>
                        {item.txn?.transactionDate && (
                          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 400, marginTop: 2 }}>
                            Detected {formatDate(item.detectedAt)}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '12px 16px', maxWidth: 160 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                          {item.txn?.categoryName || '—'}
                        </span>
                      </td>

                      {/* Description */}
                      <td style={{ padding: '12px 16px', maxWidth: 180 }}>
                        <span style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                          {item.txn?.description || '—'}
                        </span>
                      </td>

                      {/* Amount */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-expense)', fontVariantNumeric: 'tabular-nums' }}>
                          {item.txn?.amount != null ? formatCurrency(item.txn.amount) : '—'}
                        </span>
                      </td>

                      {/* Score */}
                      <td style={{ padding: '12px 16px' }}>
                        <ScoreBar score={item.ensembleScore} />
                      </td>

                      {/* Algorithms */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {ALGORITHMS.map((a) => (
                            <AlgoBadge key={a.key} active={item.algorithms[a.key]} label={a.shortName} />
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          ...(ANOMALY_STATUS_STYLES[item.status] || ANOMALY_STATUS_STYLES.Pending),
                          display: 'inline-flex', alignItems: 'center',
                          padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        }}>
                          {ANOMALY_STATUS_LABELS[item.status] || item.status}
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
          )}

          {!loading && totalCount > PAGE_SIZE && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-divider)' }}>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                totalCount={totalCount}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </Card>

      </div>
    </>
  );
}