import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Table, type ColDef } from '@/components/ui/Table';

interface Row { id: string; n: number }
const rows: Row[] = [{ id: 'b', n: 3 }, { id: 'a', n: 1 }, { id: 'c', n: 2 }];
const columns: ColDef<Row>[] = [
  { key: 'id', header: 'ID', sortable: true, sortValue: r => r.id, render: r => r.id },
  { key: 'n', header: 'N', sortable: true, sortValue: r => r.n, render: r => String(r.n) },
];

function order(container: HTMLElement): string[] {
  return [...container.querySelectorAll('tbody tr')].map(tr => tr.querySelector('td')!.textContent!);
}

describe('Table sorting (R6-6)', () => {
  it('sorts ascending then descending then clears on repeated header clicks', () => {
    const { container, getByText } = render(<Table columns={columns} rows={rows} rowKey={r => r.id} />);
    expect(order(container)).toEqual(['b', 'a', 'c']); // original order

    fireEvent.click(getByText('ID'));
    expect(order(container)).toEqual(['a', 'b', 'c']); // asc

    fireEvent.click(getByText('ID'));
    expect(order(container)).toEqual(['c', 'b', 'a']); // desc

    fireEvent.click(getByText('ID'));
    expect(order(container)).toEqual(['b', 'a', 'c']); // cleared → original
  });

  it('renders the empty node when there are no rows', () => {
    const { getByText } = render(<Table columns={columns} rows={[]} rowKey={r => r.id} empty="Nothing here" />);
    expect(getByText('Nothing here')).toBeTruthy();
  });
});
