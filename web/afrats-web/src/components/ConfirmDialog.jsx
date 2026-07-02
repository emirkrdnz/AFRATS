// src/components/ConfirmDialog.jsx
// Lightweight confirmation modal for destructive actions.
// Replaces window.confirm() for a polished, branded UX.

import { useEffect, useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',  // 'danger' | 'default'
  onConfirm,
  onCancel,
  isLoading = false,
  requireText,                                       // type-to-confirm string
  requireTextLabel = 'Type to confirm',
  requireTextPlaceholder,
}) {
  const [typed, setTyped] = useState('');

  // Reset typed text whenever the dialog reopens
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isLoading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isLoading, onCancel]);

  if (!open) return null;

  const typedMatches = !requireText || typed.trim() === requireText;
  const confirmDisabled = isLoading || !typedMatches;

  const confirmBtnClass = variant === 'danger'
    ? 'bg-expense hover:opacity-90 text-white'
    : 'bg-primary hover:opacity-90 text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !isLoading && onCancel()}
      />

      {/* Modal */}
      <div
        className="relative bg-surface rounded-lg w-full max-w-md mx-4 overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            {variant === 'danger' && (
              <div className="shrink-0 w-10 h-10 rounded-full bg-expense/10 flex items-center justify-center">
                <FiAlertTriangle className="w-5 h-5 text-expense" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-text">{title}</h3>
              {message && (
                <p className="text-sm text-text-secondary mt-1">{message}</p>
              )}
              {requireText && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    {requireTextLabel}
                  </label>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={requireTextPlaceholder}
                    disabled={isLoading}
                    autoFocus
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:border-secondary disabled:opacity-50"
                    style={{
                      '--tw-ring-shadow': 'var(--shadow-focus-ring)',
                    }}
                    onFocus={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-focus-ring)'; }}
                    onBlur={(e) => { e.currentTarget.style.boxShadow = ''; }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-surface-subtle border-t border-divider">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-2 text-sm text-text-secondary hover:bg-border-subtle rounded-md transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmBtnClass}`}
          >
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
