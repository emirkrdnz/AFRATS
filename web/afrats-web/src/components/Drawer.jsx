// src/components/Drawer.jsx
// Reusable right-side drawer. Used by TransactionDrawer, ImportCsvDrawer,
// AnomalyDetail (later), UserDetail (later) — anywhere a contextual edit/view
// pane is needed without losing the underlying list.

import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';

export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = 'max-w-md',  // tailwind max-w utility (e.g. max-w-md, max-w-lg, max-w-xl)
  footer,              // optional ReactNode rendered in sticky footer
  children,
}) {
  // Close on ESC key
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`fixed top-0 right-0 h-full w-full ${width} bg-white shadow-xl z-50 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 id="drawer-title" className="text-base font-semibold text-gray-900">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer — sticky if provided */}
        {footer && (
          <div className="border-t border-gray-200 px-5 py-3 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
