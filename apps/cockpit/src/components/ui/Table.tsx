import type { ReactNode } from 'react';

export interface ColDef<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  mono?: boolean;
  width?: string | number;
}

interface Props<T> {
  columns: ColDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: string;
}

export function Table<T>({ columns, rows, rowKey, onRowClick, empty = 'No data' }: Props<T>) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-2)', position: 'sticky', top: 0, zIndex: 1 }}>
            {columns.map(c => (
              <th key={c.key} style={{
                padding: '7px 12px', textAlign: 'left',
                fontSize: 10, fontWeight: 600, color: 'var(--fg-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                borderBottom: '1px solid var(--line)',
                width: c.width,
              }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--fg-3)' }}>
                {empty}
              </td>
            </tr>
          ) : rows.map(row => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: '1px solid var(--line)',
                cursor: onRowClick ? 'pointer' : undefined,
                transition: 'background var(--t)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              {columns.map(c => (
                <td key={c.key} style={{
                  padding: '7px 12px',
                  fontSize: c.mono ? 12 : 13,
                  fontFamily: c.mono ? 'var(--font-mono)' : undefined,
                  color: c.mono ? 'var(--fg-2)' : 'var(--fg)',
                }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
