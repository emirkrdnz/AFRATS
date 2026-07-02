// src/components/Skeleton.jsx
// Shimmer loading placeholder. Replaces 8 ad-hoc skeleton implementations.
// Keyframes (af-shimmer) live in index.css.

export default function Skeleton({
  width = '100%',
  height = 16,
  rounded = 6,
  className = '',
  style = {},
}) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius: rounded,
        background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
        backgroundSize: '200% 100%',
        animation: 'af-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

// Table-row skeleton with N columns. Each cell holds a Skeleton.
export function SkeletonRow({ columns = 5, cellHeight = 14 }) {
  return (
    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <Skeleton height={cellHeight} />
        </td>
      ))}
    </tr>
  );
}
