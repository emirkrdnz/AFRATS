// src/components/EmptyState.jsx
// Centered empty / no-data placeholder. Visual based on AnomalyList's existing
// circle + title + description pattern.

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  style = {},
}) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px 20px',
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #E8F1FB, #F4F8FC)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          {icon}
        </div>
      )}
      {title && (
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--color-primary-dark)',
            marginBottom: description ? 4 : 0,
          }}
        >
          {title}
        </div>
      )}
      {description && (
        <div
          style={{
            fontSize: 13,
            color: '#6B7280',
            maxWidth: 360,
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
