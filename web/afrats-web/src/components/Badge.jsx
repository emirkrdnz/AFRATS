// src/components/Badge.jsx
// Reusable badge for risk levels, anomaly status, and any pill-style label.

const VARIANTS = {
  // Risk levels — TODO 2C: tokenize the dark-text shades (#1E8449, #B9770E, #C0392B)
  'risk-low':       'bg-income/10 text-[#1E8449] border-income/30',
  'risk-medium':    'bg-warning-strong/10 text-[#B9770E] border-warning-strong/30',
  'risk-high':      'bg-expense/10 text-[#C0392B] border-expense/30',

  // Anomaly status
  'status-pending':       'bg-gray-100 text-gray-700 border-gray-200',
  'status-reviewed':      'bg-blue-50 text-blue-700 border-blue-200',
  'status-confirmed':     'bg-expense/10 text-[#C0392B] border-expense/30',
  'status-falsepositive': 'bg-gray-100 text-gray-500 border-gray-200',

  // Generic
  default: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function Badge({ variant = 'default', children, className = '' }) {
  const variantClass = VARIANTS[variant] ?? VARIANTS.default;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium ${variantClass} ${className}`}
    >
      {children}
    </span>
  );
}

// Helper: map risk level string to badge variant
export function riskLevelVariant(level) {
  switch ((level || '').toLowerCase()) {
    case 'low':    return 'risk-low';
    case 'medium': return 'risk-medium';
    case 'high':   return 'risk-high';
    default:       return 'default';
  }
}

// Helper: map anomaly status to badge variant
export function statusVariant(status) {
  switch ((status || '').toLowerCase()) {
    case 'pending':       return 'status-pending';
    case 'reviewed':      return 'status-reviewed';
    case 'confirmed':     return 'status-confirmed';
    case 'falsepositive': return 'status-falsepositive';
    default:              return 'default';
  }
}
