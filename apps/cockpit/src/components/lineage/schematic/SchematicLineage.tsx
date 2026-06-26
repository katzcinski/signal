/**
 * Stateful Container des Schaltplan-Boards: lädt den Lineage-Graphen, baut das
 * Modell, lässt ELK layouten und verdrahtet Interaktion (Click-to-trace),
 * Filter (Suche / Layer / System), den View-Toggle und den Inspector.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLineage } from '@/api/lineage';
import { t } from '@/i18n/de';
import { buildSchematicModel } from './model';
import { layoutSchematic, type SchematicLayout, type ViewMode } from './layout';
import { traceCircuit, type CircuitTrace } from './trace';
import { SchematicBoard } from './SchematicBoard';
import { SchematicInspector, type InspectorSelection } from './SchematicInspector';
import { laneColor } from './theme';

const S = t.lineage.schematic;

export default function SchematicLineage() {
  const { data, isLoading } = useLineage();
  const [viewMode, setViewMode] = useState<ViewMode>('column');
  const [search, setSearch] = useState('');
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [hiddenSystems, setHiddenSystems] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<InspectorSelection | null>(null);
  const [trace, setTrace] = useState<CircuitTrace | null>(null);
  const [layout, setLayout] = useState<SchematicLayout | null>(null);
  const [layoutBusy, setLayoutBusy] = useState(false);

  const model = useMemo(
    () => buildSchematicModel(data?.nodes ?? [], data?.columnEdges ?? [], data?.edges ?? []),
    [data?.nodes, data?.columnEdges, data?.edges],
  );

  // ELK neu rechnen, wenn sich Modell oder Ansicht ändern. Filter/Selektion
  // ändern nur Dimming/Highlight — kein Relayout. Stale Ergebnisse verwerfen.
  const layoutToken = useRef(0);
  useEffect(() => {
    if (!model.chips.length) {
      setLayout(null);
      return;
    }
    const token = ++layoutToken.current;
    setLayoutBusy(true);
    layoutSchematic(model, viewMode)
      .then(result => {
        if (token === layoutToken.current) setLayout(result);
      })
      .finally(() => {
        if (token === layoutToken.current) setLayoutBusy(false);
      });
  }, [model, viewMode]);

  const layers = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; order: number; count: number }>();
    for (const c of model.chips) {
      const prev = seen.get(c.laneKey);
      if (prev) prev.count += 1;
      else seen.set(c.laneKey, { key: c.laneKey, label: c.layer, order: c.laneOrder, count: 1 });
    }
    return [...seen.values()].sort((a, b) => a.order - b.order);
  }, [model.chips]);

  const systems = useMemo(() => {
    const set = new Set<string>();
    for (const c of model.chips) if (c.system) set.add(c.system);
    return [...set].sort();
  }, [model.chips]);

  const dimmedChips = useMemo(() => {
    const dimmed = new Set<string>();
    const q = search.trim().toLowerCase();
    for (const c of model.chips) {
      const byLayer = hiddenLayers.has(c.laneKey);
      const bySystem = !!c.system && hiddenSystems.has(c.system);
      const bySearch =
        q.length > 0 &&
        !c.label.toLowerCase().includes(q) &&
        !c.pins.some(p => p.id.toLowerCase().includes(q));
      if (byLayer || bySystem || bySearch) dimmed.add(c.id);
    }
    return dimmed;
  }, [model.chips, search, hiddenLayers, hiddenSystems]);

  const selectPin = (node: string, pin: string) => {
    setSelection({ node, pin });
    setTrace(traceCircuit(model, node, pin));
  };
  const selectChip = (node: string) => {
    setSelection({ node });
    setTrace(null);
  };
  const clearSelection = () => {
    setSelection(null);
    setTrace(null);
  };

  const toggleSet = (setter: typeof setHiddenLayers, key: string) =>
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Object-Mode kennt keinen Spalten-Trace.
  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'object') setTrace(null);
  };

  return (
    <div style={page}>
      <div style={toolbar}>
        <span style={titleStyle}>{t.lineage.title}</span>
        <input
          style={searchInput}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={S.searchPlaceholder}
          aria-label={S.searchPlaceholder}
        />
        <div style={toggle}>
          <button
            type="button"
            style={toggleBtn(viewMode === 'column')}
            onClick={() => setView('column')}
          >
            {S.columnLevel}
          </button>
          <button
            type="button"
            style={toggleBtn(viewMode === 'object')}
            onClick={() => setView('object')}
          >
            {S.objectLevel}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {systems.map(sys => {
            const active = !hiddenSystems.has(sys);
            return (
              <button
                key={sys}
                type="button"
                style={chip(active)}
                onClick={() => toggleSet(setHiddenSystems, sys)}
              >
                {sys}
              </button>
            );
          })}
        </div>
        {trace && (
          <button type="button" style={chip(true)} onClick={clearSelection}>
            {S.clearTrace}
          </button>
        )}
      </div>

      <div style={body}>
        <aside style={sidebar}>
          <h4 style={sideHeading}>{S.layers}</h4>
          {layers.map(l => {
            const active = !hiddenLayers.has(l.key);
            return (
              <button
                key={l.key}
                type="button"
                style={layerRow(active)}
                onClick={() => toggleSet(setHiddenLayers, l.key)}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: laneColor(l.order) }} />
                <span style={{ flex: 1, textAlign: 'left' }}>{l.label}</span>
                <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{l.count}</span>
              </button>
            );
          })}
        </aside>

        <main style={canvas}>
          {isLoading || layoutBusy ? (
            <div style={hint}>{S.loading}</div>
          ) : !layout || !model.chips.length ? (
            <div style={hint}>{S.empty}</div>
          ) : (
            <SchematicBoard
              layout={layout}
              tracePins={trace?.pins}
              traceEdges={trace?.edges}
              dimmedChips={dimmedChips}
              selectedChip={selection && !selection.pin ? selection.node : null}
              selectedPin={selection?.pin ? { node: selection.node, pin: selection.pin } : null}
              onSelectChip={selectChip}
              onSelectPin={selectPin}
              onBackground={clearSelection}
            />
          )}
        </main>

        <aside style={inspector}>
          <SchematicInspector model={model} selection={selection} />
        </aside>
      </div>
    </div>
  );
}

// ---- styles ----
const page: CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 };
const toolbar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderBottom: '1px solid var(--line)',
  flexWrap: 'wrap', flexShrink: 0,
};
const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--fg)' };
const searchInput: CSSProperties = {
  flex: 1, minWidth: 160, maxWidth: 320, background: 'var(--bg-1)', border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)', color: 'var(--fg)', fontSize: 13, padding: '8px 11px', outline: 'none',
};
const toggle: CSSProperties = {
  display: 'flex', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden',
};
const toggleBtn = (active: boolean): CSSProperties => ({
  background: active ? 'var(--cont)' : 'transparent', color: active ? '#fff' : 'var(--fg-2)',
  border: 'none', fontSize: 12, fontWeight: 600, padding: '7px 12px', cursor: 'pointer',
});
const chip = (active: boolean): CSSProperties => ({
  fontSize: 11.5, fontWeight: 500, padding: '6px 10px', borderRadius: 'var(--r-full)',
  border: `1px solid ${active ? 'var(--cont)' : 'var(--line)'}`,
  color: active ? 'var(--fg)' : 'var(--fg-3)',
  background: active ? 'color-mix(in srgb, var(--cont) 12%, transparent)' : 'var(--bg-1)', cursor: 'pointer',
});
const body: CSSProperties = { display: 'flex', flex: 1, minHeight: 0 };
const sidebar: CSSProperties = {
  width: 210, borderRight: '1px solid var(--line)', padding: '14px 12px', overflowY: 'auto', flexShrink: 0,
};
const sideHeading: CSSProperties = {
  fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-3)', margin: '0 0 10px', fontWeight: 600,
};
const layerRow = (active: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 'var(--s2)', width: '100%', padding: '6px 4px', borderRadius: 'var(--r)',
  fontSize: 12.5, cursor: 'pointer', color: active ? 'var(--fg-2)' : 'var(--fg-3)', background: 'transparent',
  border: 'none', opacity: active ? 1 : 0.5,
});
const canvas: CSSProperties = { flex: 1, overflow: 'auto', background: 'var(--bg-1)', position: 'relative' };
const inspector: CSSProperties = {
  width: 320, borderLeft: '1px solid var(--line)', padding: 'var(--s4)', overflowY: 'auto', flexShrink: 0,
};
const hint: CSSProperties = { color: 'var(--fg-3)', fontSize: 13, padding: 40, textAlign: 'center' };
