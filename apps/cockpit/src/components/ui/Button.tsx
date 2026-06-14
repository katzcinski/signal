import type { ButtonHTMLAttributes, CSSProperties } from 'react';

// UX-F6: shared Button primitive. Spacing/radius come from tokens, not memory.
// Variants encode intent (primary action, neutral, ghost, destructive); sizes
// keep padding consistent across screens.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, CSSProperties> = {
  primary:   { background: 'var(--cont)', color: '#fff', border: '1px solid var(--cont)' },
  secondary: { background: 'var(--bg-2)', color: 'var(--fg-2)', border: '1px solid var(--line-2)' },
  ghost:     { background: 'none', color: 'var(--fg-3)', border: '1px solid var(--line-2)' },
  danger:    { background: 'none', color: 'var(--status-fail)', border: '1px solid var(--status-fail)' },
};

const SIZE: Record<Size, CSSProperties> = {
  sm: { padding: 'var(--s1) var(--s3)', fontSize: 11 },
  md: { padding: 'var(--s2) var(--s4)', fontSize: 12 },
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'secondary', size = 'md', style, disabled, ...rest }: Props) {
  return (
    <button
      disabled={disabled}
      style={{
        borderRadius: 'var(--r-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--t), opacity var(--t)',
        ...VARIANT[variant],
        ...SIZE[size],
        ...style,
      }}
      {...rest}
    />
  );
}
