// src/components/anomaly/AlgoBadge.jsx
// 30×22 pill marking whether an individual detector flagged the transaction.
// Canonical copy lifted from AnomalyList.jsx.

export default function AlgoBadge({ active, label }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 30,
      height: 22,
      borderRadius: 5,
      fontSize: 11,
      fontWeight: 800,
      background: active ? 'var(--color-primary)' : '#F1F5F9',  // TODO 2C: tokenize #F1F5F9
      color:      active ? '#fff'                 : '#94A3B8',  // TODO 2C: tokenize #94A3B8
    }}>
      {label}
    </span>
  );
}
