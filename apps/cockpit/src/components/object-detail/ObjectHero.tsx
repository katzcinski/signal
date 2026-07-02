import { Button } from '@/components/ui/Button';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { StatusPill } from '@/components/ui/StatusPill';
import { relativeTime, absoluteTime } from '@/lib/time';
import { t } from '@/i18n/de';
import type { CheckResult, ContractOut, ObjectSummary, RunListItem } from '@/types';
import { ObjectSummaryCard } from './ObjectSummaryCard';

interface MonitoringEntry {
  status: string;
  view?: string | null;
  error?: string | null;
}

interface ObjectHeroProps {
  object: ObjectSummary;
  contract?: ContractOut;
  latestRun?: RunListItem;
  results: CheckResult[];
  monitoringEnabled: boolean;
  monitoringEntry?: MonitoringEntry;
  monitoringSpace?: string;
  monitoringPending: boolean;
  canProfile: boolean;
  canCreateChecks: boolean;
  checksActionPending: boolean;
  runPending: boolean;
  onRequestMonitoring: () => void;
  onOpenProfile: () => void;
  onOpenChecksWorkbench: () => void;
  onStartRun: () => void;
}

function replaceAllTokens(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    template,
  );
}

function monitoringCopy(enabled: boolean, entry: MonitoringEntry | undefined) {
  if (!enabled) {
    return {
      value: t.objectDetail.hero.monitoringDisabled,
      hint: t.objectDetail.hero.monitoringDisabledHint,
      tone: 'var(--fg-3)',
    };
  }
  if (!entry) {
    return {
      value: t.objectDetail.hero.monitoringReady,
      hint: t.objectDetail.hero.monitoringReadyHint,
      tone: 'var(--status-warn)',
    };
  }
  if (entry.status === 'provisioned') {
    return {
      value: t.objectDetail.hero.monitoringProvisioned,
      hint: entry.view ?? t.objectDetail.hero.monitoringProvisionedHint,
      tone: 'var(--status-ok)',
    };
  }
  if (entry.status === 'error') {
    return {
      value: t.objectDetail.hero.monitoringError,
      hint: entry.error ?? t.objectDetail.hero.monitoringErrorHint,
      tone: 'var(--status-fail)',
    };
  }
  return {
    value: t.objectDetail.hero.monitoringRequested,
    hint: t.objectDetail.hero.monitoringRequestedHint,
    tone: 'var(--status-warn)',
  };
}

export function ObjectHero({
  object,
  contract,
  latestRun,
  results,
  monitoringEnabled,
  monitoringEntry,
  monitoringSpace,
  monitoringPending,
  canProfile,
  canCreateChecks,
  checksActionPending,
  runPending,
  onRequestMonitoring,
  onOpenProfile,
  onOpenChecksWorkbench,
  onStartRun,
}: ObjectHeroProps) {
  const failedChecks = results.filter(result => !result.passed).length;
  const owners = contract?.owners?.length ? contract.owners.join(', ') : '';
  const ownerHint = owners
    ? replaceAllTokens(t.objectDetail.hero.ownerTeams, { teams: owners })
    : t.objectDetail.hero.ownerHint;
  const contractHint = contract
    ? `${t.objectDetail.hero.versionPrefix} ${contract.version} | ${contract.owned_by}`
    : t.objectDetail.hero.noContractHint;
  const monitoring = monitoringCopy(monitoringEnabled, monitoringEntry);
  const monitoringTitle = monitoringEntry?.error ?? (
    monitoringEntry?.view ? `View: ${monitoringEntry.view}` : monitoringSpace
  );

  return (
    <section className="object-detail-hero object-detail-section">
      <div className="object-detail-hero-head">
        <div style={{ minWidth: 0 }}>
          <div className="object-detail-title-row">
            <h1 style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-h1)',
              lineHeight: 'var(--lh-tight)',
              fontWeight: 700,
              color: 'var(--fg)',
              overflowWrap: 'anywhere',
            }}>
              {object.name}
            </h1>
            <FamilyTag family={object.family} />
            <StatusPill status={object.status ?? 'unknown'} size="sm" />
          </div>
          <div className="object-detail-meta" style={{ marginTop: 10 }}>
            <span>{t.objects.colSpace} <b>{object.space}</b></span>
            <span style={{ color: 'var(--line-2)' }}>|</span>
            <span>{t.objects.colLayer} <b>{object.layer}</b></span>
            <span style={{ color: 'var(--line-2)' }}>|</span>
            <span>{t.objectDetail.hero.schemaLabel} <b style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{object.schema_name}</b></span>
          </div>
          <div className="object-detail-facts" style={{ marginTop: 12 }}>
            <span style={{ color: 'var(--fg-3)' }}>{t.objectDetail.hero.ownerLabel}</span>
            <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{object.owned_by}</span>
            <span style={{ color: 'var(--fg-3)' }}>{ownerHint}</span>
          </div>
        </div>

        <div className="object-detail-actions">
          {monitoringEnabled && !monitoringEntry && (
            <Button
              onClick={onRequestMonitoring}
              pending={monitoringPending}
              pendingLabel={t.objectDetail.hero.monitoringRequesting}
            >
              {t.objectDetail.hero.monitoringRequest}
            </Button>
          )}
          {monitoringEnabled && monitoringEntry && (
            <span
              title={monitoringTitle}
              style={{
                fontSize: 'var(--fs-meta)',
                color: monitoring.tone,
                border: `1px solid ${monitoring.tone}`,
                borderRadius: 'var(--r-md)',
                padding: '6px 12px',
                background: `color-mix(in srgb, ${monitoring.tone} 12%, transparent)`,
                alignSelf: 'center',
              }}
            >
              {monitoring.value}
            </span>
          )}
          <Button
            onClick={onOpenProfile}
            disabled={!canProfile}
            title={canProfile ? undefined : t.objectDetail.hero.profileNoRole}
          >
            {t.objectDetail.hero.profile}
          </Button>
          <Button
            onClick={onOpenChecksWorkbench}
            disabled={!canCreateChecks}
            pending={checksActionPending}
            pendingLabel={t.objectDetail.creatingChecks}
            title={canCreateChecks ? undefined : t.objectDetail.createChecksNoWrite}
          >
            {contract ? t.objectDetail.editChecks : t.objectDetail.createChecks}
          </Button>
          <Button
            variant="primary"
            onClick={onStartRun}
            pending={runPending}
            pendingLabel={t.objectDetail.running}
          >
            {t.objectDetail.run}
          </Button>
        </div>
      </div>

      <div className="object-detail-summary-grid">
        <ObjectSummaryCard
          label={t.objectDetail.hero.latestRunTitle}
          value={latestRun ? (
            <>
              <StatusPill status={latestRun.overall_status} size="sm" />
              <span
                title={absoluteTime(latestRun.started_at)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)' }}
              >
                {relativeTime(latestRun.started_at)}
              </span>
            </>
          ) : t.objectDetail.hero.noRun}
          hint={latestRun
            ? replaceAllTokens(t.objectDetail.hero.latestRunHint, {
                passed: String(latestRun.passed),
                total: String(latestRun.total),
              })
            : t.objectDetail.hero.noRunHint}
          tone={latestRun ? 'var(--fg)' : 'var(--fg-3)'}
        />
        <ObjectSummaryCard
          label={t.objectDetail.hero.failingChecksTitle}
          value={String(failedChecks)}
          hint={results.length
            ? failedChecks > 0
              ? replaceAllTokens(t.objectDetail.hero.failedChecksHint, {
                  failed: String(failedChecks),
                  total: String(results.length),
                })
              : t.objectDetail.hero.noFailuresHint
            : t.objectDetail.hero.noResultsHint}
          tone={failedChecks > 0 ? 'var(--status-fail)' : 'var(--status-ok)'}
        />
        <ObjectSummaryCard
          label={t.objectDetail.hero.contractTitle}
          value={contract ? (t.lifecycle[contract.lifecycle] ?? contract.lifecycle) : t.objectDetail.hero.noContract}
          hint={contractHint}
          tone={contract ? 'var(--cont)' : 'var(--fg-3)'}
        />
        <ObjectSummaryCard
          label={t.objectDetail.hero.monitoringTitle}
          value={monitoring.value}
          hint={monitoring.hint}
          tone={monitoring.tone}
        />
      </div>
    </section>
  );
}

