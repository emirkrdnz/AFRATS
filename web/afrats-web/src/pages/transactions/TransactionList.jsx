// src/pages/transactions/TransactionList.jsx
// Full transaction list page: filter pills + collapsible advanced panel,
// shimmer skeleton, sortable table, server-side pagination via URL params.
// Integrates TransactionDrawer and ImportCsvDrawer.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FiPlus, FiUpload, FiFilter,
  FiSearch, FiX,
  FiAlertCircle, FiAlertTriangle, FiChevronRight,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import transactionApi from '../../api/transactionApi';
import ConfirmDialog from '../../components/ConfirmDialog';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { SkeletonRow } from '../../components/Skeleton';
import TransactionDrawer from './TransactionDrawer';
import ImportCsvDrawer from './ImportCsvDrawer';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { extractErrorMessage, extractFieldErrors } from '../../api/errorHelper';

// ─── Design tokens ─────────────────────────────────────────────────────────
// Values resolved at runtime via CSS variables defined in index.css.
const T = {
  navy:        'var(--color-primary)',
  blue:        'var(--color-secondary)',
  green:       'var(--color-income)',
  red:         'var(--color-expense)',
  orange:      'var(--color-warning-strong)',
  purple:      'var(--color-accent)',
  purpleLight: '#9B59B6',                       // TODO 2C: tokenize purple light shade

  pageBg:      'var(--color-page)',
  cardBg:      'var(--color-surface)',
  borderBase:  'var(--color-border)',
  borderSubtle:'var(--color-border-subtle)',

  textPrimary: 'var(--color-text)',
  textSecondary:'var(--color-text-secondary)',
  textMuted:   'var(--color-text-muted)',
  textDisabled:'var(--color-text-disabled)',
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function ddmmyyyyToIso(value) {
  const match = value?.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return value;

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? value : iso;
}

function normalizeTransactionCsv(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return text;

  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const dateIndex = header.indexOf('date');
  if (dateIndex === -1) return text;

  const normalizedLines = [lines[0]];
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      normalizedLines.push(line);
      continue;
    }

    const cells = splitCsvLine(line);
    if (cells[dateIndex]) {
      cells[dateIndex] = ddmmyyyyToIso(cells[dateIndex]);
    }
    normalizedLines.push(cells.map((cell) => (cell.includes(',') || cell.includes('"') ? `"${cell.replaceAll('"', '""')}"` : cell)).join(','));
  }

  return normalizedLines.join('\n');
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const isIncome = type === 'Income';
  const style = isIncome
    ? { background: 'var(--color-success-bg)', color: '#166534', border: '1px solid var(--color-success-border)' }
    : { background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--color-error-border)' };
  return (
    <span style={{ ...style, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
      {type}
    </span>
  );
}

// Sort controls removed — headers are static columns now.

// ─── Filter card ────────────────────────────────────────────────────────────
function FilterCard({ filters, onChange, onClear, categories, hasActive }) {
  const [dateError, setDateError] = useState('');

  const handleDateFrom = (v) => {
    if (v && filters.dateTo && v > filters.dateTo) { setDateError('"From" cannot be after "To".'); return; }
    setDateError(''); onChange({ dateFrom: v || undefined, page: undefined });
  };

  const handleDateTo = (v) => {
    if (v && filters.dateFrom && v < filters.dateFrom) { setDateError('"To" cannot be before "From".'); return; }
    setDateError(''); onChange({ dateTo: v || undefined, page: undefined });
  };

  const label = { fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 5, display: 'block', letterSpacing: '0.05em', textTransform: 'uppercase' };
  const inp   = { width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: `1px solid ${T.borderBase}`, borderRadius: 8, background: '#fff', color: T.textPrimary, outline: 'none', fontFamily: 'inherit' };

  return (
    <Card
      className="af-fadeUp af-e1"
      accent={`linear-gradient(90deg, ${T.purple}, ${T.purpleLight})`}
      title="Filters"
      action={hasActive ? (
        <button
          onClick={onClear}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', fontSize: 11, fontWeight: 600,
            border: `1px solid ${T.borderBase}`, borderRadius: 20,
            background: '#fff', color: T.textSecondary, cursor: 'pointer',
          }}
        >
          <FiX size={11} /> Clear all
        </button>
      ) : null}
    >
      {/* Row 1: Search + Category + From + To */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: '2 1 240px' }}>
          <label style={label}>Search</label>
          <div style={{ position: 'relative' }}>
            <FiSearch size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' }} />
            <input type="text" value={filters.search || ''} onChange={(e) => onChange({ search: e.target.value || undefined, page: undefined })} placeholder="Description or category…" style={{ ...inp, paddingLeft: 30 }} />
          </div>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={label}>Category</label>
          <select value={filters.categoryId || ''} onChange={(e) => onChange({ categoryId: e.target.value || undefined, page: undefined })} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 140px' }}>
          <label style={label}>From</label>
          <input type="date" lang="en-GB" value={filters.dateFrom || ''} max={filters.dateTo || undefined} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => handleDateFrom(e.target.value)} style={{ ...inp, cursor: 'pointer' }} />
        </div>
        <div style={{ flex: '0 0 140px' }}>
          <label style={label}>To</label>
          <input type="date" lang="en-GB" value={filters.dateTo || ''} min={filters.dateFrom || undefined} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => handleDateTo(e.target.value)} style={{ ...inp, cursor: 'pointer' }} />
        </div>
        <div style={{ flex: '0 0 100px' }}>
          <label style={label}>Min ₺</label>
          <input
            type="number"
            min={0}
            value={filters.minAmount ?? ''}
            onKeyDown={(e) => {
              if (e.key === '-' || e.key === 'Minus') e.preventDefault();
            }}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                onChange({ minAmount: undefined, page: undefined });
                return;
              }
              const num = Number(raw);
              onChange({ minAmount: Number.isFinite(num) ? Math.max(0, num) : undefined, page: undefined });
            }}
            placeholder="0"
            style={inp}
          />
        </div>
        <div style={{ flex: '0 0 100px' }}>
          <label style={label}>Max ₺</label>
          <input
            type="number"
            min={0}
            value={filters.maxAmount ?? ''}
            onKeyDown={(e) => {
              if (e.key === '-' || e.key === 'Minus') e.preventDefault();
            }}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                onChange({ maxAmount: undefined, page: undefined });
                return;
              }
              const num = Number(raw);
              onChange({ maxAmount: Number.isFinite(num) ? Math.max(0, num) : undefined, page: undefined });
            }}
            placeholder="∞"
            style={inp}
          />
        </div>
      </div>

      {dateError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.red, fontSize: 12 }}>
          <FiAlertCircle size={13} /> {dateError}
        </div>
      )}
    </Card>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onPage }) {
  const range = useMemo(() => {
    const pages = [];
    const delta = 2;
    const left  = Math.max(1, page - delta);
    const right = Math.min(totalPages, page + delta);
    if (left > 1)         { pages.push(1); if (left > 2) pages.push('…'); }
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages) { if (right < totalPages - 1) pages.push('…'); pages.push(totalPages); }
    return pages;
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  const btnBase = {
    minWidth: 32, height: 32, borderRadius: 8,
    border: `1px solid ${T.borderBase}`,
    background: '#fff', cursor: 'pointer', fontSize: 13,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s', color: T.textSecondary, fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '16px 0 4px' }}>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        style={{ ...btnBase, opacity: page === 1 ? 0.35 : 1, padding: '0 8px' }}
      >
        ‹ Prev
      </button>
      {range.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={{ padding: '0 4px', color: T.textMuted, fontSize: 13 }}>…</span>
          : (
            <button
              key={p}
              onClick={() => onPage(p)}
              style={{
                ...btnBase,
                background: p === page ? T.navy : '#fff',
                color: p === page ? '#fff' : T.textSecondary,
                borderColor: p === page ? T.navy : T.borderBase,
                fontWeight: p === page ? 700 : 400,
              }}
            >
              {p}
            </button>
          )
      )}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        style={{ ...btnBase, opacity: page === totalPages ? 0.35 : 1, padding: '0 8px' }}
      >
        Next ›
      </button>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function TransactionList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL-driven state ────────────────────────────────────────────────────
  const filters = useMemo(() => ({
    type:       searchParams.get('type')       || undefined,
    categoryId: searchParams.get('categoryId') || undefined,
    search:     searchParams.get('search')     || undefined,
    dateFrom:   searchParams.get('dateFrom')   || undefined,
    dateTo:     searchParams.get('dateTo')     || undefined,
    minAmount:  searchParams.get('minAmount')  ? Number(searchParams.get('minAmount')) : undefined,
    maxAmount:  searchParams.get('maxAmount')  ? Number(searchParams.get('maxAmount')) : undefined,
    sortBy:     searchParams.get('sortBy')     || 'transactionDate',
    sortDir:    searchParams.get('sortDir')    || 'desc',
    page:       Number(searchParams.get('page') || '1'),
  }), [searchParams]);

  const applyFilters = useCallback((partial) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(partial).forEach(([k, v]) => {
        if (v == null || v === '') next.delete(k);
        else next.set(k, String(v));
      });
      return next;
    });
  }, [setSearchParams]);

  const resetFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  // ── Data state ──────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [totalCount,   setTotalCount]   = useState(0);
  // Overall Income/Expense counts (filter-aware, page-independent) for the pills.
  const [typeCounts,   setTypeCounts]   = useState({ Income: null, Expense: null });
  const [isLoading,    setIsLoading]    = useState(true);
  const [error,        setError]        = useState(null);

  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ── Drawer state ────────────────────────────────────────────────────────
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [editTarget,     setEditTarget]     = useState(null);
  const [isSaving,       setIsSaving]       = useState(false);
  const [serverErrors,   setServerErrors]   = useState({});
  const [importOpen,     setImportOpen]     = useState(false);
  const [showFilters,    setShowFilters]    = useState(false);
  const [confirmOpen,    setConfirmOpen]    = useState(false);
  const [isDeleting,     setIsDeleting]     = useState(false);

  // ── Fetch transactions ──────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {
        page: filters.page,
        pageSize: PAGE_SIZE,
        ...(filters.type       && { type:       filters.type }),
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(filters.search     && { search:     filters.search }),
        ...(filters.dateFrom   && { dateFrom:   filters.dateFrom }),
        ...(filters.dateTo     && { dateTo:     filters.dateTo }),
        ...(filters.minAmount != null && { minAmount: filters.minAmount }),
        ...(filters.maxAmount != null && { maxAmount: filters.maxAmount }),
        sortBy:  filters.sortBy,
        sortDir: filters.sortDir,
      };
      const res = await transactionApi.getAll(params);
      // Expected: { items: [], totalCount: N } or { data: { items, totalCount } }
      const data = res.data ?? res;
      setTransactions((data.items ?? []).filter(Boolean));
      setTotalCount(data.totalCount ?? 0);
    } catch (e) {
      setError(e?.message || 'Failed to load transactions.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // ── Fetch categories (once) ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await transactionApi.getCategories();
        const data = res.data ?? res;
        setCategories(data.items ?? data ?? []);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchTransactions();
    });
  }, [fetchTransactions]);

  // ── Overall Income/Expense totals for the pills ─────────────────────────
  // Filter-aware (search/category/date) but page- and type-independent, so the
  // pill numbers reflect the whole result set, not just the current page.
  useEffect(() => {
    let cancelled = false;
    const base = {
      pageSize: 1,
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.search     && { search:     filters.search }),
      ...(filters.dateFrom   && { dateFrom:   filters.dateFrom }),
      ...(filters.dateTo     && { dateTo:     filters.dateTo }),
      ...(filters.minAmount != null && { minAmount: filters.minAmount }),
      ...(filters.maxAmount != null && { maxAmount: filters.maxAmount }),
    };
    Promise.all([
      transactionApi.getAll({ ...base, type: 'Income' }),
      transactionApi.getAll({ ...base, type: 'Expense' }),
    ])
      .then(([inc, exp]) => {
        if (cancelled) return;
        setTypeCounts({
          Income:  (inc.data ?? inc).totalCount ?? 0,
          Expense: (exp.data ?? exp).totalCount ?? 0,
        });
      })
      .catch(() => { if (!cancelled) setTypeCounts({ Income: null, Expense: null }); });
    return () => { cancelled = true; };
  }, [filters.categoryId, filters.search, filters.dateFrom, filters.dateTo, filters.minAmount, filters.maxAmount]);

  // Sorting removed for this layout — headers are static.

  // ── Save handler ────────────────────────────────────────────────────────
  const handleSave = async (values) => {
    setIsSaving(true);
    setServerErrors({});
    try {
      if (editTarget) {
        await transactionApi.update(editTarget.id, values);
      } else {
        await transactionApi.create(values);
      }
      setDrawerOpen(false);
      fetchTransactions();
    } catch (e) {
      const fieldErrors = extractFieldErrors(e);
      setServerErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(extractErrorMessage(e, 'Could not save transaction.'));
      }
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editTarget) return;
    setConfirmOpen(false);
    setIsDeleting(true);
    try {
      await transactionApi.delete(editTarget.id);
      setDrawerOpen(false);
      fetchTransactions();
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Could not delete transaction.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImport = async (file) => {
    const text = await file.text();
    const normalizedCsv = normalizeTransactionCsv(text);
    const normalizedFile = new File([normalizedCsv], file.name, { type: file.type || 'text/csv' });
    const res = await transactionApi.importCsv(normalizedFile);
    fetchTransactions();
    return res.data ?? res;
  };

  const openCreate = () => { setEditTarget(null); setServerErrors({}); setDrawerOpen(true); };
  const openEdit   = (txn) => { setEditTarget(txn); setServerErrors({}); setDrawerOpen(true); };

  // ── Derived ─────────────────────────────────────────────────────────────
  const hasAdvancedActive = !!(
    filters.search || filters.categoryId || filters.dateFrom ||
    filters.dateTo || filters.minAmount != null || filters.maxAmount != null
  );

  const typePillStyle = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1.5px solid',
    transition: 'all 0.18s',
    ...(active
      ? { background: T.navy, color: '#fff', borderColor: T.navy }
      : { background: '#fff', color: T.textSecondary, borderColor: T.borderBase }),
  });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes af-fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .af-fadeUp { animation: af-fadeUp .45s cubic-bezier(.22,1,.36,1) both; }
        .af-e1{animation-delay:0ms}
        .af-e2{animation-delay:70ms}
        .af-e3{animation-delay:140ms}
        .af-e4{animation-delay:210ms}
        .af-row-hover:hover { border-left: 3px solid var(--color-primary) !important; background-color: rgba(248,250,252,.9) !important; }
        .af-row-hover:hover .af-chevron { color: var(--color-secondary); }
        .af-sort-btn:hover { color: var(--color-secondary); }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>

      {/* Page title */}
      <div className="af-e1" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.5px' }}>
            Transactions
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            View, filter and manage all your financial transactions
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setImportOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: `1.5px solid ${T.borderBase}`, borderRadius: 8, background: '#fff', color: T.textSecondary, cursor: 'pointer' }}>
            <FiUpload size={14} /> Import CSV
          </button>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 8, background: T.navy, color: '#fff', cursor: 'pointer' }}>
            <FiPlus size={15} /> New Transaction
          </button>
        </div>
      </div>

      {/* Filter card — sadece showFilters açıkken */}
      {showFilters && (
        <div className="af-e1">
          <FilterCard
            filters={filters}
            onChange={applyFilters}
            onClear={() => { resetFilters(); setShowFilters(false); }}
            categories={categories}
            hasActive={hasAdvancedActive}
          />
        </div>
      )}

      <div
        className="af-e2"
        style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', overflow: 'hidden', boxShadow: 'var(--shadow-card)', transition: 'transform var(--duration-base) var(--ease-out), box-shadow var(--duration-base) var(--ease-out)' }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,23,42,.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 1px 6px rgba(15,23,42,.07)'; }}
      >
        <div style={{ height: 4, background: T.navy }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '16px 24px 0' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Transaction List</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
              {isLoading ? 'Loading…' : `${totalCount.toLocaleString('en-US')} records`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {['All', 'Income', 'Expense'].map((t) => {
              const active = t === 'All' ? !filters.type : filters.type === t;
              return (
                <button key={t} style={typePillStyle(active)} onClick={() => applyFilters({ type: t === 'All' ? undefined : t, page: 1 })}>
                  {t !== 'All' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: t === 'Income' ? T.green : T.red, display: 'inline-block' }} />}
                  {t}
                  {t !== 'All' && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'rgba(255,255,255,0.2)' : T.borderSubtle, borderRadius: 10, padding: '1px 6px', color: active ? '#fff' : T.textMuted }}>
                      {typeCounts[t] != null ? typeCounts[t].toLocaleString('en-US') : '—'}
                    </span>
                  )}
                </button>
              );
            })}
            <span style={{ width: 1.5, height: 24, background: '#E2E8F0', flexShrink: 0 }} />
            <button
              onClick={() => setShowFilters((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all .15s',
                border: `2px solid ${showFilters || hasAdvancedActive ? T.purple : '#E2E8F0'}`,
                background: showFilters || hasAdvancedActive ? T.purple : 'transparent',
                color: showFilters || hasAdvancedActive ? '#fff' : '#64748B',
              }}
            >
              <FiFilter size={11} />
              Filters
              {hasAdvancedActive && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: showFilters ? 'rgba(255,255,255,.6)' : T.purple }} />
              )}
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 24px 0', overflowX: 'auto' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)', fontSize: 13, marginBottom: 10 }}>
              <FiAlertCircle size={15} /> {error}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-subtle)', borderBottom: `1.5px solid ${T.borderBase}` }}>
                {['Date','Category','Description','Type','Amount',''].map((col, i) => (
                  <th key={col + i} style={{ padding: '9px 12px', textAlign: 'left', width: i === 5 ? 28 : '20%', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textMuted }}>{col}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} columns={6} />)
                : transactions.length === 0
                  ? (
                    <tr><td colSpan={6}>
                      <EmptyState
                        icon={<FiAlertCircle size={22} />}
                        title="No transactions found"
                        action={(hasAdvancedActive || filters.type) ? (
                          <button onClick={resetFilters} style={{ color: T.blue, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Clear filters</button>
                        ) : null}
                      />
                    </td></tr>
                  )
                  : transactions.map((txn, idx) => (
                    <tr key={txn.id} className={`af-row-hover af-fadeUp af-e${Math.min(idx + 1, 4)}`} onClick={() => openEdit(txn)}
                      style={{ borderBottom: `1px solid ${T.borderSubtle}`, cursor: 'pointer', transition: 'background 0.12s', borderLeft: '3px solid transparent' }}>
                      <td style={{ padding: '11px 12px', fontSize: 13, color: T.textSecondary, whiteSpace: 'nowrap' }}>{formatDate(txn.transactionDate)}</td>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ fontSize: 13, color: T.textPrimary, fontWeight: 500 }}>{txn.categoryName ?? txn.category?.name ?? '—'}</span>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ fontSize: 13, color: txn.description ? T.textSecondary : T.textMuted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: txn.description ? 'normal' : 'italic', maxWidth: 380 }}>
                          {txn.description || 'No description'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px' }}><TypeBadge type={txn.type} /></td>
                      <td style={{ padding: '11px 12px', textAlign: 'left' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: txn.type === 'Income' ? T.green : T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(Math.abs(txn.amount))}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px 11px 6px', width: 28 }}>
                        <FiChevronRight className="af-chevron" size={15} style={{ color: 'var(--color-text-disabled)', transition: 'color .15s' }} />
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        <div style={{ padding: '4px 24px 20px' }}>
          <Pagination page={filters.page} totalPages={totalPages} onPage={(p) => applyFilters({ page: p })} />
        </div>
      </div>

      {/* ── Drawers ──────────────────────────────────────────────────────────── */}
      <TransactionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        onDelete={editTarget ? () => setConfirmOpen(true) : undefined}
        transaction={editTarget}
        categories={categories}
        isSaving={isSaving}
        serverErrors={serverErrors}
      />

      <ImportCsvDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this transaction?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      </div>
    </>
  );
}