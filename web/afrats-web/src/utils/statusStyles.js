// src/utils/statusStyles.js
// Canonical inline-style maps for anomaly status pills and risk-level pills.
// Values resolve via CSS variables defined in index.css.

export const ANOMALY_STATUS_STYLES = {
  Pending:       { background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1.5px solid var(--color-warning-border)' },
  Reviewed:      { background: 'var(--color-info-bg)',    color: 'var(--color-info)',    border: '1.5px solid var(--color-info-border)' },
  Confirmed:     { background: 'var(--color-error-bg)',   color: 'var(--color-error)',   border: '1.5px solid var(--color-error-border)' },
  FalsePositive: { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1.5px solid var(--color-success-border)' },
};

export const ANOMALY_STATUS_LABELS = {
  Pending:       'Pending',
  Reviewed:      'Reviewed',
  Confirmed:     'Confirmed',
  FalsePositive: 'False positive',
};

export const RISK_LEVEL_STYLES = {
  Low:    { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1.5px solid var(--color-success-border)' },
  Medium: { background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1.5px solid var(--color-warning-border)' },
  High:   { background: 'var(--color-error-bg)',   color: 'var(--color-error)',   border: '1.5px solid var(--color-error-border)' },
};
