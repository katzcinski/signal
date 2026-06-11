import { useEffect, useRef, useState } from 'react';

interface Props {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  width?: number | string;
}

/**
 * Filter-as-you-type dropdown over a fixed option set. NO free text:
 * the committed value can only ever be one of `options` — typing merely
 * filters; blur/Escape reverts the input to the last committed value.
 */
export function Combobox({ options, value, onChange, placeholder, ariaLabel, width = 200 }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value); }, [value]);

  const filtered = options.filter(o => o.toLowerCase().includes(text.toLowerCase()));
  const clamped = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  const commit = (option: string) => {
    onChange(option);
    setText(option);
    setOpen(false);
  };

  const revert = () => {
    setText(value);
    setOpen(false);
  };

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) revert();
    };
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[clamped]) commit(filtered[clamped]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      revert();
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', width }}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel ?? placeholder}
        value={text}
        placeholder={placeholder}
        onChange={e => { setText(e.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
          fontFamily: 'var(--font-mono)', outline: 'none',
        }}
      />
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 5,
            marginTop: 2, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--fg-3)' }}>—</div>
          ) : filtered.slice(0, 50).map((o, i) => (
            <button
              key={o}
              role="option"
              aria-selected={o === value}
              // mousedown beats the input blur/doc-click handler
              onMouseDown={e => { e.preventDefault(); commit(o); }}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: i === clamped ? 'var(--bg-3)' : 'none', border: 'none',
                color: 'var(--fg)', padding: '5px 10px', fontSize: 12,
                fontFamily: 'var(--font-mono)', cursor: 'pointer',
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
