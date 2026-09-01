import type { CSSProperties } from 'react';

// Toggle-Bar (Slider) statt nativer Checkbox — gleiche Semantik (An/Aus), aber
// als eigenständiges <button role="switch">, damit Ein/Aus auf einen Blick als
// Zustand lesbar ist statt als An-/Abhaken. Unstyled-Checkbox-Fallback bewusst
// vermieden: native Checkboxen folgen der Browser-/OS-Akzentfarbe, nicht den
// Theme-Tokens, und wirken in der dichten Kanalzug-Kopfzeile inkonsistent.
const TRACK_WIDTH = 32;
const TRACK_HEIGHT = 18;
const KNOB_SIZE = 14;
const KNOB_INSET = (TRACK_HEIGHT - KNOB_SIZE) / 2;

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label': string;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Switch({ checked, onChange, disabled, style, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        padding: 0,
        borderRadius: 'var(--r-full)',
        border: '1px solid ' + (checked ? 'var(--cont)' : 'var(--line-2)'),
        background: checked ? 'var(--cont)' : 'var(--bg-3)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background var(--t), border-color var(--t)',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: KNOB_INSET - 1,
          left: checked ? TRACK_WIDTH - KNOB_SIZE - KNOB_INSET - 1 : KNOB_INSET - 1,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: 'var(--r-full)',
          background: checked ? '#fff' : 'var(--fg-3)',
          transition: 'left var(--t), background var(--t)',
        }}
      />
    </button>
  );
}
