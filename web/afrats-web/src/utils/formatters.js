import dayjs from 'dayjs';

// Backend datetime'lar UTC olarak saklanır ama bazıları timezone marker'sız
// JSON'lanıyor (örn. "2026-06-02T08:21:23" — Z eki yok). dayjs bunu LOCAL
// zaman olarak parse ederdi → kullanıcı 11 Türkiye saatinde import etse bile
// ekranda 08 UTC görüyordu. Helper'ımız: timezone bilgisi yoksa Z ekleyip
// UTC olarak parse eder, dayjs format aşamasında otomatik local'e çevirir.
export function parseAsUtc(date) {
  if (!date) return null;
  if (date instanceof Date) return dayjs(date);
  if (typeof date !== 'string') return dayjs(date);
  // Already has timezone info? Use as-is.
  if (date.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(date)) {
    return dayjs(date);
  }
  // No timezone info — assume UTC.
  return dayjs(date + 'Z');
}

// Currency: ₺12,450.00
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount);
}

// Compact currency for KPI tiles: 1.408 → "1.4K ₺", -2_000_111_825_730 → "-2.0T ₺".
// Trillion-scale values rendered as raw locale strings (Net Flow on AdminDashboard)
// were unreadable. K/M/B/T suffixes keep the tile width predictable; the full
// formatted value is meant to live in a `title` tooltip on the caller.
const COMPACT_TIERS = [
  { value: 1e12, suffix: 'T' },
  { value: 1e9,  suffix: 'B' },
  { value: 1e6,  suffix: 'M' },
  { value: 1e3,  suffix: 'K' },
];
export function formatCompactCurrency(amount, { currency = '₺', decimals = 1 } = {}) {
  if (amount == null || Number.isNaN(amount)) return '—';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  for (const { value, suffix } of COMPACT_TIERS) {
    if (abs >= value) {
      return `${sign}${(abs / value).toFixed(decimals)}${suffix} ${currency}`.trim();
    }
  }
  return `${sign}${abs.toFixed(0)} ${currency}`.trim();
}

// Verbose currency for tooltips — preserves every digit so the user can audit
// the compact tile. Uses tr-TR grouping (dot thousands separator) to match
// the rest of AFRATS.
export function formatFullCurrency(amount, { currency = '₺' } = {}) {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `${amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${currency}`;
}

// Date: 12.04.2025 — UTC-aware, kullanıcının yerel zamanı
export function formatDate(date) {
  const d = parseAsUtc(date);
  return d ? d.format('DD.MM.YYYY') : '—';
}

// Date + time: 12.04.2025 14:30 — UTC-aware
export function formatDateTime(date) {
  const d = parseAsUtc(date);
  return d ? d.format('DD.MM.YYYY HH:mm') : '—';
}

// Long month + year (e.g. "April 2025") — display-only, not for sorting.
export function formatMonthYear(date) {
  const d = parseAsUtc(date);
  return d ? d.format('MMMM YYYY') : '—';
}

// Two YYYY-MM keys → "May vs April" (same year) or "Jan 2026 vs Dec 2025"
// (year boundary). Backend'in `spending_trend_months` metadata'sını dürüst bir
// label'a çevirmek için: kullanıcıya hangi ay'lar kıyaslandığını net göster,
// "vs last month" varsayımına bel bağlama. null/eksik input → null döner,
// caller "vs prior month" fallback'ine düşer.
const _MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatTwoMonthLabel(recentYm, prevYm) {
  if (!recentYm || !prevYm) return null;
  const parse = (ym) => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return null;
    const y  = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (mo < 1 || mo > 12) return null;
    return [y, mo];
  };
  const r = parse(recentYm);
  const p = parse(prevYm);
  if (!r || !p) return null;
  const [ry, rm] = r;
  const [py, pm] = p;
  if (ry === py) return `${_MONTH_SHORT[rm - 1]} vs ${_MONTH_SHORT[pm - 1]}`;
  return `${_MONTH_SHORT[rm - 1]} ${ry} vs ${_MONTH_SHORT[pm - 1]} ${py}`;
}
