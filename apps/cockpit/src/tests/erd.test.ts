import { describe, expect, it } from 'vitest';
import { buildErdModel, formatNodeLabel } from '@/lib/erd';
import type { ContractOut } from '@/types';

const SALES: ContractOut = {
  product: 'DS_SALES_ORDERS',
  dataset: 'DS_SALES_ORDERS',
  kind: 'consumer_contract',
  owned_by: 'product',
  lifecycle: 'active',
  version: '1.0.0',
  guarantees: {
    schema: { columns: ['ORDER_ID', 'CUSTOMER_ID', 'ORDER_DATE'], mode: 'closed' },
    keys: [{ columns: ['ORDER_ID'], unique: true }],
    not_null: [{ columns: ['ORDER_ID', 'CUSTOMER_ID'] }],
    completeness: [{ column: 'CUSTOMER_ID', min_pct: 98 }],
    freshness: { column: 'ORDER_DATE', max_age: 'PT26H' },
    referential: [{ fk: ['CUSTOMER_ID'], parent: 'DS_CUSTOMERS', parent_key: ['CUSTOMER_ID'] }],
  },
};

const CUSTOMERS: ContractOut = {
  product: 'DS_CUSTOMERS',
  dataset: 'DS_CUSTOMERS',
  kind: 'provider_contract',
  owned_by: 'product',
  lifecycle: 'active',
  version: '2.1.0',
  guarantees: {
    schema: { columns: ['CUSTOMER_ID', 'NAME'], mode: 'open' },
    keys: [{ columns: ['CUSTOMER_ID'], unique: true }],
  },
};

describe('buildErdModel', () => {
  it('derives one node per contract with column markers', () => {
    const { nodes } = buildErdModel([SALES, CUSTOMERS]);
    const sales = nodes.find(n => n.id === 'DS_SALES_ORDERS')!;
    expect(sales.columns).toHaveLength(3);
    const orderId = sales.columns.find(c => c.name === 'ORDER_ID')!;
    expect(orderId.pk).toBe(true);
    expect(orderId.notNull).toBe(true);
    const custId = sales.columns.find(c => c.name === 'CUSTOMER_ID')!;
    expect(custId.pk).toBe(false);
    expect(custId.notNull).toBe(true);
    expect(custId.completenessPct).toBe(98);
    expect(sales.columns.find(c => c.name === 'ORDER_DATE')!.freshness).toBe(true);
  });

  it('builds a referential edge between two contracts', () => {
    const { edges } = buildErdModel([SALES, CUSTOMERS]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'DS_SALES_ORDERS', target: 'DS_CUSTOMERS' });
    expect(edges[0].label).toBe('CUSTOMER_ID → CUSTOMER_ID');
  });

  it('synthesizes an external ghost node for uncontracted parents', () => {
    const { nodes, edges } = buildErdModel([SALES]);
    const ext = nodes.find(n => n.external)!;
    expect(ext.id).toBe('ext:DS_CUSTOMERS');
    expect(ext.dataset).toBe('DS_CUSTOMERS');
    expect(edges[0].target).toBe('ext:DS_CUSTOMERS');
  });

  it('produces no edges when no referential guarantees exist', () => {
    const { edges } = buildErdModel([CUSTOMERS]);
    expect(edges).toHaveLength(0);
  });
});

describe('formatNodeLabel', () => {
  it('renders header, badges and PK/marker prefixes', () => {
    const { nodes } = buildErdModel([SALES]);
    const label = formatNodeLabel(nodes.find(n => n.id === 'DS_SALES_ORDERS')!);
    expect(label).toContain('DS_SALES_ORDERS');
    expect(label).toContain('consumer · v1.0.0');
    expect(label).toContain('PK ORDER_ID');
    expect(label).toMatch(/CUSTOMER_ID •.*≥98%/);
  });

  it('marks external nodes as referenced', () => {
    const { nodes } = buildErdModel([SALES]);
    const label = formatNodeLabel(nodes.find(n => n.external)!);
    expect(label).toContain('extern · referenziert');
  });
});
