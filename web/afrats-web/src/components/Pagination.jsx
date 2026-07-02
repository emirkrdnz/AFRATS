// src/components/Pagination.jsx
// Pagination controls — reusable across all list pages.

import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

export default function Pagination({
  page,           // current page (1-indexed)
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  // Build a compact page list: 1 ... currentPage-1 currentPage currentPage+1 ... lastPage
  const buildPageList = () => {
    const pages = new Set();
    pages.add(1);
    pages.add(totalPages);
    for (let i = page - 1; i <= page + 1; i++) {
      if (i >= 1 && i <= totalPages) pages.add(i);
    }
    const sorted = [...pages].sort((a, b) => a - b);
    const result = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
      result.push(sorted[i]);
    }
    return result;
  };

  const pageList = buildPageList();

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-1 py-3 text-sm">
      {/* Left: result count + page size selector */}
      <div className="flex items-center gap-4 text-gray-600">
        <span>
          Showing <span className="font-medium text-gray-900">{startItem}–{endItem}</span> of{' '}
          <span className="font-medium text-gray-900">{totalCount}</span>
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-secondary focus:border-secondary"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <FiChevronLeft className="w-4 h-4" />
        </button>

        {pageList.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-2 text-gray-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-8 h-8 px-2 rounded text-xs font-medium transition-colors ${
                p === page
                  ? 'bg-primary text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <FiChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
