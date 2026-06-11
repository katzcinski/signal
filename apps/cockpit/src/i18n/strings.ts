// R3-6: single source of truth for UI copy. English, centralized — no more
// inline string/locale mix. Add keys here rather than hard-coding strings.
export const t = {
  // Navigation
  nav: {
    dashboard: 'Cockpit',
    objects: 'Objects',
    contracts: 'Contracts',
    coverage: 'Coverage',
    lineage: 'Lineage',
    incidents: 'Incidents',
    proposals: 'Proposals',
    governance: 'Governance',
    runs: 'Runs',
  },

  // Status vocabulary (R3-6: 'error' not 'unknown'; 'failed' → 'fail')
  status: {
    pass: 'Pass',
    fail: 'Fail',
    warn: 'Warn',
    critical: 'Critical',
    error: 'Error',
    unknown: 'Unknown',
    skipped_stale: 'Skipped (stale)',
    skipped_dependency: 'Skipped (dependency)',
    downgraded: 'Downgraded',
  },

  stateHint: {
    skipped_stale: 'Check skipped: source data is stale — no pass/fail verdict.',
    skipped_dependency: 'Check skipped: a prerequisite check failed — no pass/fail verdict.',
    downgraded: 'Severity was downgraded by gating.',
    error: 'Check could not be executed (technical error) — no pass/fail verdict.',
  },

  compliance: {
    compliant: 'Compliant',
    breached: 'Breached',
    unknown: 'Unknown',
  },

  lifecycle: {
    draft: 'Draft',
    active: 'Active',
    deprecated: 'Deprecated',
  },

  family: {
    observability: 'Observability',
    quality: 'Quality',
    contract: 'Contract',
  },

  // Coverage map badges (R3-6: unified ✓/◐/⚠/○)
  coverageBadge: {
    covered: '✓',
    partial: '◐',
    gap: '⚠',
    out_of_scope: '○',
  },

  // Common / actions
  common: {
    noData: 'No data',
    loading: 'Loading…',
    error: 'Failed to load',
    retry: 'Retry',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    all: 'All',
    search: 'Search…',
  },

  actions: {
    triggerRun: 'Run checks',
    liveRun: 'Run in progress',
    approve: 'Approve',
    deprecate: 'Deprecate',
    compile: 'Compile',
    seed: 'Seed',
    diff: 'Check diff',
    accept: 'Accept',
    reject: 'Reject',
    acknowledge: 'Acknowledge',
    investigate: 'Investigate',
    resolve: 'Resolve',
    assign: 'Assign',
  },
} as const;
