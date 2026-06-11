import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObjects, useTriggerRun } from '@/api/objects';
import { useContracts, useSeedContract, useDryRunChecks } from '@/api/contracts';
import { useRuns } from '@/api/runs';
import { useExtract } from '@/api/system';

// R3-4: guided first-run for an empty tenant — Extract → Seed → Dry-run → Result,
// each step a live button against an existing endpoint, marked done from data.
const stepCard: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16,
  borderBottom: '1px solid var(--line)',
};
const btn: React.CSSProperties = {
  border: 'none', borderRadius: 5, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
  background: 'var(--cont)', color: '#fff',
};

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700,
      background: done ? 'var(--status-ok)' : 'var(--bg-2)',
      color: done ? '#fff' : 'var(--fg-3)',
      border: done ? 'none' : '1px solid var(--line-2)',
    }}>
      {done ? '✓' : n}
    </span>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const { data: objects = [] } = useObjects();
  const { data: contracts = [] } = useContracts();
  const { data: runs = [] } = useRuns();
  const extract = useExtract();
  const seed = useSeedContract();
  const firstObject = objects[0]?.id ?? '';
  const firstContract = contracts[0];
  const dryRun = useDryRunChecks(firstContract?.dataset || firstContract?.product || firstObject);
  const triggerRun = useTriggerRun(firstContract?.product || firstObject);
  const [dryRunDone, setDryRunDone] = useState(false);

  const steps = [
    {
      title: 'Extract metadata',
      desc: 'Load the inventory and lineage snapshot so the cockpit knows your objects.',
      done: objects.length > 0,
      action: () => extract.mutate('default'),
      label: extract.isPending ? 'Extracting…' : 'Run extract',
      disabled: false,
    },
    {
      title: 'Seed a contract',
      desc: 'Generate a draft data contract from an object’s declared schema and keys.',
      done: contracts.length > 0,
      action: () => firstObject && seed.mutate(firstObject),
      label: seed.isPending ? 'Seeding…' : `Seed ${firstObject || 'contract'}`,
      disabled: objects.length === 0,
    },
    {
      title: 'Dry-run the checks',
      desc: 'Compile the contract to checks and run them once without persisting results.',
      done: dryRunDone || runs.length > 0,
      action: () => dryRun.mutate({}, { onSuccess: () => setDryRunDone(true) }),
      label: dryRun.isPending ? 'Running…' : 'Dry-run checks',
      disabled: contracts.length === 0,
    },
    {
      title: 'See your first result',
      desc: 'Trigger a real run and open the object to inspect its status and history.',
      done: runs.length > 0,
      action: () => {
        if (firstContract?.product || firstObject) {
          triggerRun.mutate({}, {
            onSuccess: () => navigate(`/objects/${firstContract?.product || firstObject}`),
          });
        }
      },
      label: triggerRun.isPending ? 'Starting…' : 'Run & view',
      disabled: contracts.length === 0,
    },
  ];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Welcome to Signal</h1>
        <p style={{ color: 'var(--fg-3)', fontSize: 13, marginTop: 4 }}>
          Four steps to your first data-quality result.
        </p>
      </div>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ ...stepCard, borderBottom: i < steps.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <StepNumber n={i + 1} done={s.done} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{s.desc}</div>
            </div>
            <button
              onClick={s.action}
              disabled={s.disabled}
              style={{ ...btn, opacity: s.disabled ? 0.4 : 1, cursor: s.disabled ? 'not-allowed' : 'pointer' }}
            >
              {s.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
