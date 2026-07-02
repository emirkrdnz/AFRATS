// src/pages/anomalies/AnomalyFilters.jsx
// Compact layout — all filters in one visible area, no wasted space.
// Date: English locale, min/max validation, range arrow.
// Algorithm: pills inline. Search: category + description.

import { useState, useEffect, useRef } from 'react';
import { FiSearch, FiX, FiCalendar, FiAlertCircle } from 'react-icons/fi';
import { ALGORITHMS } from '../../utils/anomalyAlgorithms';

/* ─── Tokens ─────────────────────────────────────────────────────────────── */
const INPUT = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 11px', fontSize: 12, color: 'var(--color-text)',
  border: '1.5px solid #E2E8F0', borderRadius: 8,
  background: '#fff', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color .15s, box-shadow .15s',
};
const FOCUS_ON  = { borderColor: 'var(--color-secondary)', boxShadow: 'var(--shadow-focus-ring)' };
const FOCUS_ERR = { borderColor: 'var(--color-expense)', boxShadow: '0 0 0 3px rgba(231,76,60,.12)' };
const LABEL = { fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' };

const ALGO_OPTS = [
  { key: 'all', label: 'All' },
  ...ALGORITHMS.map((a) => ({ key: a.key, label: a.shortName })),
];

function useFocusState() {
  const [f, setF] = useState(false);
  return { onFocus: () => setF(true), onBlur: () => setF(false), focused: f };
}

/* ─── Date field — English locale, full-click, min/max aware ────────────── */
function DateField({ value, onChange, placeholder, min, max, error }) {
  const ref = useRef(null);
  const { onFocus, onBlur, focused } = useFocusState();

  const openPicker = () => { try { ref.current?.showPicker(); } catch { /* showPicker unsupported */ } ref.current?.focus(); };

  const borderStyle = error
    ? FOCUS_ERR
    : focused
      ? FOCUS_ON
      : {};

  return (
    <div style={{ position: 'relative', cursor: 'pointer' }} onClick={openPicker}>
      {/* Placeholder overlay when empty */}
      {!value && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 11,
          fontSize: 12, color: error ? 'var(--color-expense)' : '#94A3B8',
        }}>
          <FiCalendar size={12} />
          {placeholder}
        </div>
      )}
      <input
        ref={ref}
        type="date"
        lang="en-GB"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value || undefined)}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          ...INPUT,
          cursor: 'pointer',
          color: value ? 'var(--color-text)' : 'transparent',
          ...(error ? { border: '1.5px solid var(--color-expense)' } : {}),
          ...borderStyle,
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AnomalyFilters
═══════════════════════════════════════════════════════════════════════════ */
export default function AnomalyFilters({ filters, onChange, onReset }) {
  const [search, setSearch] = useState(filters.search || '');
  const { onFocus: sf, onBlur: sb, focused: sfc } = useFocusState();
  const { onFocus: stf, onBlur: stb, focused: stfc } = useFocusState();
  const [dateError, setDateError] = useState('');

  /* Sync search ↔ URL */
  useEffect(() => { setSearch(filters.search || ''); }, [filters.search]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (filters.search || '')) onChange({ search: search || undefined });
    }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  /* Date validation */
  const handleDateFrom = (v) => {
    setDateError('');
    if (v && filters.dateTo && v > filters.dateTo) {
      setDateError('Start date cannot be after end date.');
      return;
    }
    onChange({ dateFrom: v });
  };

  const handleDateTo = (v) => {
    setDateError('');
    if (v && filters.dateFrom && v < filters.dateFrom) {
      setDateError('End date cannot be before start date.');
      return;
    }
    onChange({ dateTo: v });
  };

  /* Algorithm multi-select */
  const selectedAlgos = new Set((filters.algorithm || '').split(',').filter(Boolean));
  const isAlgoAll = selectedAlgos.size === 0;
  const toggleAlgo = (key) => {
    if (key === 'all') { onChange({ algorithm: undefined }); return; }
    const next = new Set(selectedAlgos);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange({ algorithm: next.size > 0 ? [...next].join(',') : undefined });
  };

  const hasActive = filters.search || filters.algorithm || filters.dateFrom || filters.dateTo || filters.status;

  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
      {/* Accent bar */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, var(--color-accent), #9B59B6)' }} />

      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Row 1: title + clear ────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Filters</span>
          {hasActive && (
            <button onClick={() => { onReset(); setDateError(''); }} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, color: 'var(--color-accent)',
              background: 'rgba(142,68,173,.07)', border: '1.5px solid rgba(142,68,173,.25)',
              borderRadius: 20, padding: '3px 10px', cursor: 'pointer', transition: 'all .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(142,68,173,.07)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
            >
              <FiX size={10} /> Clear all
            </button>
          )}
        </div>

        {/* ── Row 2: Search | Status | From → To ─────────────────────── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ flex: '1 1 180px', minWidth: 160 }}>
            <div style={{ ...LABEL, marginBottom: 5 }}>Search</div>
            <div style={{ position: 'relative' }}>
              <FiSearch size={13} style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: sfc ? 'var(--color-secondary)' : '#94A3B8', pointerEvents: 'none',
              }} />
              <input
                type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Category or description…"
                onFocus={sf} onBlur={sb}
                style={{ ...INPUT, paddingLeft: 30, ...(sfc && FOCUS_ON) }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8',
                  display: 'flex', padding: 2, borderRadius: 4,
                }}>
                  <FiX size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Status */}
          <div style={{ flex: '0 0 148px' }}>
            <div style={{ ...LABEL, marginBottom: 5 }}>Status</div>
            <select
              value={filters.status || ''}
              onChange={e => onChange({ status: e.target.value || undefined })}
              onFocus={stf} onBlur={stb}
              style={{ ...INPUT, appearance: 'auto', cursor: 'pointer', ...(stfc && FOCUS_ON) }}
            >
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Confirmed">Confirmed</option>
              <option value="FalsePositive">False positive</option>
            </select>
          </div>

          {/* Date range */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ width: 144 }}>
              <div style={{ ...LABEL, marginBottom: 5 }}>From</div>
              <DateField
                value={filters.dateFrom || ''}
                onChange={handleDateFrom}
                placeholder="Start date"
                max={filters.dateTo || undefined}
                error={!!dateError && !!filters.dateFrom}
              />
            </div>
            {/* Arrow connector */}
            <div style={{
              flexShrink: 0, fontSize: 16, color: '#CBD5E1', paddingBottom: 8,
              lineHeight: 1, userSelect: 'none',
            }}>→</div>
            <div style={{ width: 144 }}>
              <div style={{ ...LABEL, marginBottom: 5 }}>To</div>
              <DateField
                value={filters.dateTo || ''}
                onChange={handleDateTo}
                placeholder="End date"
                min={filters.dateFrom || undefined}
                error={!!dateError && !!filters.dateTo}
              />
            </div>
          </div>
        </div>

        {/* Date error */}
        {dateError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-expense)', marginTop: -4 }}>
            <FiAlertCircle size={12} /> {dateError}
          </div>
        )}

        {/* ── Row 3: Algorithm pills (inline label + pills) ───────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2, flexWrap: 'wrap' }}>
          <span style={{ ...LABEL, marginBottom: 0, flexShrink: 0 }}>Algorithm</span>
          <div style={{ width: 1, height: 14, background: '#E2E8F0', flexShrink: 0 }} />
          {ALGO_OPTS.map(({ key, label }) => {
            const isActive = key === 'all' ? isAlgoAll : selectedAlgos.has(key);
            return (
              <button key={key} onClick={() => toggleAlgo(key)} style={{
                padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', transition: 'all .15s',
                border: `1.5px solid ${isActive ? 'var(--color-primary)' : '#E2E8F0'}`,
                background: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? '#fff' : '#64748B',
              }}>
                {label}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
