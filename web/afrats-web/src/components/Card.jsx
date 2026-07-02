// src/components/Card.jsx
// Shared surface primitive.
//
// Round 2B additions:
//   - hover:       on-hover lift (translateY + shadow swap)
//   - headerIcon:  optional icon tile to the left of the title
//   - padding:     'sm' | 'md' | 'lg' body padding

const BODY_PADDING = { sm: 12, md: 18, lg: 24 };

export default function Card({
  accent,
  title,
  subtitle,
  action,
  headerIcon,
  hover = false,
  padding = 'md',
  onClick,
  children,
  className = '',
  style = {},
  bodyStyle = {},
}) {
  const bodyPad = BODY_PADDING[padding] ?? BODY_PADDING.md;

  const baseStyle = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-card)',
    transition: hover
      ? 'transform var(--duration-base) var(--ease-out), box-shadow var(--duration-base) var(--ease-out)'
      : undefined,
    cursor: onClick ? 'pointer' : undefined,
    ...style,
  };

  const handlers = hover
    ? {
        onMouseEnter: (e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
        },
      }
    : {};

  return (
    <div
      className={className}
      style={baseStyle}
      onClick={onClick}
      {...handlers}
    >
      {accent && <div style={{ height: 4, background: accent }} />}
      {(title || action) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-divider)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {headerIcon && (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-primary-50)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {headerIcon}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              {title && (
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
                  {title}
                </div>
              )}
              {subtitle && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      <div style={{ padding: bodyPad, ...bodyStyle }}>{children}</div>
    </div>
  );
}
