// src/components/anomaly/ScoreBar.jsx
// 44 px ensemble-score bar + monospace red score number.
// Canonical copy lifted from AnomalyList.jsx.

const ANOMALY_COLOR = 'var(--color-expense)';

export default function ScoreBar({ score }) {
  const val = Number(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 44,
        height: 5,
        borderRadius: 3,
        background: '#F1F5F9',  // TODO 2C: tokenize #F1F5F9 (slate-100)
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(val, 1) * 100}%`,
          borderRadius: 3,
          background: ANOMALY_COLOR,
        }} />
      </div>
      <span style={{
        fontSize: 13,
        fontWeight: 800,
        color: ANOMALY_COLOR,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'ui-monospace, monospace',
      }}>
        {val.toFixed(2)}
      </span>
    </div>
  );
}
