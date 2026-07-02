// src/components/SummaryCard.jsx
// Summary metric card with optional trend indicator (vs previous period).
// Designed for information density — same footprint, more signal.
//
// Round 2B addition:
//   - size: 'md' | 'lg' — md keeps the existing text-xl semibold value;
//                         lg upsizes to text-2xl bold for stat-heavy pages.

import { FiArrowUp, FiArrowDown } from 'react-icons/fi';

export default function SummaryCard({
  icon: Icon,
  label,
  value,
  valueColor,        // e.g. 'text-income' for income
  accentColor,       // 6-digit hex literal (e.g. '#27AE60'); used for icon-tile tint via `${accentColor}1A` alpha-concat.
  trend,             // { direction: 'up' | 'down' | 'flat', percent: 12.3, isPositive: true }
  comparison,        // string e.g. "vs last month: ₺40,100"
  isLoading = false,
  isError = false,
  size = 'md',
}) {
  const valueClass =
    size === 'lg'
      ? 'text-2xl font-bold leading-tight'
      : 'text-xl font-semibold leading-tight';

  return (
    <div className="bg-surface border border-border rounded-lg p-4 transition-colors hover:border-border-subtle">
      {/* Header: label + icon */}
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          {label}
        </span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ backgroundColor: accentColor ? `${accentColor}1A` : 'var(--color-border-subtle)' }}
          >
            <Icon
              className="w-4 h-4"
              style={{ color: accentColor || 'var(--color-text-muted)' }}
            />
          </div>
        )}
      </div>

      {/* Value */}
      {isLoading ? (
        <div className="h-7 w-2/3 bg-border-subtle rounded animate-pulse mb-2" />
      ) : isError ? (
        <div className="text-sm text-expense">Failed to load</div>
      ) : (
        <div className={`${valueClass} ${valueColor || 'text-text'}`}>
          {value}
        </div>
      )}

      {/* Trend + comparison row */}
      {!isLoading && !isError && (trend || comparison) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {trend && trend.direction !== 'flat' && (
            <span
              className={`inline-flex items-center gap-0.5 font-medium ${
                trend.isPositive ? 'text-income' : 'text-expense'
              }`}
            >
              {trend.direction === 'up' ? (
                <FiArrowUp className="w-3 h-3" />
              ) : (
                <FiArrowDown className="w-3 h-3" />
              )}
              {trend.percent.toFixed(1)}%
            </span>
          )}
          {comparison && (
            <span className="text-text-muted truncate">{comparison}</span>
          )}
        </div>
      )}
    </div>
  );
}
