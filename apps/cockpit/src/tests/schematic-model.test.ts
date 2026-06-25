import { describe, expect, it } from 'vitest';
import {
  buildSchematicModel,
  flattenColumnIndex,
  type RawColumnEdge,
} from '@/components/lineage/schematic/model';
import { columnId } from '@/lib/lineage';
import type { LineageNode } from '@/types';

// Fixture nach dem Vorbild des Schaltplan-Mockups (Source → Harmonized → Output),
// inkl. einer abgeleiteten Kante mit Transformations-Expression.
const NODES: LineageNode[] = [
  {
    id: 'DS_INB', label: 'DS_INB_SALES', layer: 'Source', layerCode: 'r', role: 'source',
    system: 'S/4HANA', space: 'S_SP1', columns: ['VBELN', 'NETWR'], dq_status: 'pass',
  },
  {
    id: 'DS_HRM', label: 'DS_HRM_SALES', layer: 'Harmonization', layerCode: 'ic', role: 'harmonized',
    system: 'Datasphere', space: 'H_SP1', columns: ['SALES_DOC', 'NET_VALUE_USD'], dq_status: 'warn',
    has_contract: true, has_boundary_contract: true,
  },
];

const EDGES: RawColumnEdge[] = [
  { source: 'DS_INB', sourceColumn: 'VBELN', target: 'DS_HRM', targetColumn: 'SALES_DOC', edgeType: 'direct' },
  {
    source: 'DS_INB', sourceColumn: 'NETWR', target: 'DS_HRM', targetColumn: 'NET_VALUE_USD',
    edgeType: 'computed', expression: "CURRENCY_CONVERSION(NETWR, target:'USD')",
  },
];

describe('buildSchematicModel', () => {
  const model = buildSchematicModel(NODES, EDGES);

  it('maps nodes to chips with lane + platform + DQ/contract annotation', () => {
    const hrm = model.chips.find(c => c.id === 'DS_HRM')!;
    expect(hrm.layer).toBe('Harmonization');
    expect(hrm.laneKey).toBe('ic');
    expect(hrm.system).toBe('Datasphere');
    expect(hrm.dqStatus).toBe('warn');
    expect(hrm.hasContract).toBe(true);
    expect(hrm.hasBoundaryContract).toBe(true);
  });

  it('derives pin direction dots from edges', () => {
    const inb = model.chips.find(c => c.id === 'DS_INB')!;
    const vbeln = inb.pins.find(p => p.id === 'VBELN')!;
    expect(vbeln.hasOutgoing).toBe(true);
    expect(vbeln.hasIncoming).toBe(false);

    const hrm = model.chips.find(c => c.id === 'DS_HRM')!;
    const salesDoc = hrm.pins.find(p => p.id === 'SALES_DOC')!;
    expect(salesDoc.hasIncoming).toBe(true);
    expect(salesDoc.hasOutgoing).toBe(false);
  });

  it('classifies direct vs derived and carries the transform expression', () => {
    const direct = model.edges.find(e => e.fromPin === 'VBELN')!;
    expect(direct.kind).toBe('direct');
    expect(direct.expression).toBeUndefined();

    const derived = model.edges.find(e => e.fromPin === 'NETWR')!;
    expect(derived.kind).toBe('derived');
    expect(derived.edgeType).toBe('computed');
    expect(derived.expression).toContain('CURRENCY_CONVERSION');
  });

  it('keeps pins in declared column order', () => {
    const inb = model.chips.find(c => c.id === 'DS_INB')!;
    expect(inb.pins.map(p => p.id)).toEqual(['VBELN', 'NETWR']);
  });

  it('exposes a stable pin key matching columnId', () => {
    expect(model.pinKeyOf('DS_INB', 'VBELN')).toBe(columnId('DS_INB', 'VBELN'));
  });
});

describe('flattenColumnIndex', () => {
  it('dedupes upstream/downstream into a single edge list', () => {
    // Dieselbe Kante taucht als downstream von INB und upstream von HRM auf.
    const index = {
      DS_INB: {
        NETWR: {
          upstream: [],
          downstream: [{ object: 'DS_HRM', column: 'NET_VALUE_USD', edgeType: 'computed' as const, expression: 'X' }],
        },
      },
      DS_HRM: {
        NET_VALUE_USD: {
          upstream: [{ object: 'DS_INB', column: 'NETWR', edgeType: 'computed' as const, expression: 'X' }],
          downstream: [],
        },
      },
    };
    const edges = flattenColumnIndex(index);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'DS_INB', sourceColumn: 'NETWR', target: 'DS_HRM', targetColumn: 'NET_VALUE_USD',
    });
  });
});
