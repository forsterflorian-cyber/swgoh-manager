'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorResponse,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';
import type { PlanetCategory } from '@/lib/types/platoon-readiness';

type Lookups = {
  memberNames: Record<string, string>;
  unitNames: Record<string, string>;
  platoonLabels: Record<string, string>;
};

type PlannerMode = 'manual' | 'auto';

type BonusZoneOption = {
  zoneKey: string;
  label: string;
};

type AutoTargetOption = {
  phase: number;
  category: PlanetCategory;
  label: string;
  assignedCount: number;
  requirementCount: number;
  coveragePercent: number;
};

type AutoTarget =
  | {
      kind: 'phase-category';
      phase: number;
      category: PlanetCategory;
    }
  | null;

type FullNewAssignment = {
  requirementId: string;
  phase: number | string;
  zoneKey: string;
  platoonKey: string;
  slotNumber: number | string;
  unitBaseId: string;
  unitName: string;
  planetCategory: string | null;
  memberId: string;
  playerName: string;
  platoonLabel: string;
};

type AutoZonePlanStep = {
  stepNumber: number;
  targetPlatoonId: string;
  actions: PlatoonSimulatorAction[];
  actionCost: number;
  changedAssignmentCount: number;
  displacedAssignmentCount: number;
  deltaCoveredSlots: number;
  deltaFullPlatoons: number;
  targetCoveredSlotsBefore: number;
  targetCoveredSlotsAfter: number;
  targetMissingSlotsBefore: number;
  targetMissingSlotsAfter: number;
  targetBecomesFull: boolean;
  zoneCoveredSlotsBefore: number;
  zoneCoveredSlotsAfter: number;
  zoneRequiredSlots: number;
  zoneCoveragePercentBefore: number;
  zoneCoveragePercentAfter: number;
  zoneFullPlatoonsBefore: number;
  zoneFullPlatoonsAfter: number;
};

type AutoZonePlan = {
  target: NonNullable<AutoTarget>;
  currentCoveredSlots: number;
  currentRequiredSlots: number;
  currentCoveragePercent: number;
  currentFullPlatoons: number;
  totalPlatoons: number;
  projectedCoveredSlots: number;
  projectedRequiredSlots: number;
  projectedCoveragePercent: number;
  projectedFullPlatoons: number;
  zoneComplete: boolean;
  steps: AutoZonePlanStep[];
  combinedActions: PlatoonSimulatorAction[];
};

type SimulatorApiResponse = {
  guildName: string;
  simulation: PlatoonSimulatorResponse;
  advisory: SequentialFullPlatoonPlan;
  autoPlan: AutoZonePlan | null;
  lookups: Lookups;
  settings?: {
    includedBonusZoneKeys?: string[];
    mode?: PlannerMode;
    autoTarget?: AutoTarget;
  };
  bonusZoneOptions?: BonusZoneOption[];
  autoTargetOptions?: AutoTargetOption[];
  fullNewAssignments?: FullNewAssignment[];
};

type ErrorResponse = { error: string };

function getActionTypeLabel(action: PlatoonSimulatorAction): string {
  switch (action.type) {
    case 'USE_UNUSED_OWNER':
      return 'Use unused owner';
    case 'UPGRADE_OWNER_UNIT':
      return 'Upgrade owner unit';
    case 'REMOVE_SOURCE_BLOCK':
      return 'Remove source block';
    default: {
      const exhaustiveCheck: never = action;
      return String(exhaustiveCheck);
    }
  }
}

function getActionKey(action: PlatoonSimulatorAction): string {
  if (typeof action.id === 'string' && action.id.length > 0) return action.id;

  switch (action.type) {
    case 'USE_UNUSED_OWNER':
      return `${action.type}::${action.requirementId}::${action.memberId}::${action.unitBaseId}`;
    case 'UPGRADE_OWNER_UNIT':
      return `${action.type}::${action.requirementId}::${action.memberId}::${action.unitBaseId}::${action.missingRelicTiers}::${action.missingRarity}`;
    case 'REMOVE_SOURCE_BLOCK':
      return `${action.type}::${action.requirementId ?? 'none'}::${action.memberId}::${action.unitBaseId}::${action.planetCategory ?? 'null'}::${action.blockType}`;
    default:
      return JSON.stringify(action);
  }
}

function dedupeActions(actions: PlatoonSimulatorAction[]): PlatoonSimulatorAction[] {
  const seen = new Set<string>();
  const result: PlatoonSimulatorAction[] = [];

  for (const action of actions) {
    const key = getActionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }

  return result;
}

function upsertActionByRequirementId(existing: PlatoonSimulatorAction[], action: PlatoonSimulatorAction): PlatoonSimulatorAction[] {
  if (!('requirementId' in action) || typeof action.requirementId !== 'string') {
    return dedupeActions([...existing, action]);
  }

  const filtered = existing.filter((item) => {
    if (!('requirementId' in item)) return true;
    return item.requirementId !== action.requirementId;
  });

  return dedupeActions([...filtered, action]);
}

function mergeActions(existing: PlatoonSimulatorAction[], nextActions: PlatoonSimulatorAction[]): PlatoonSimulatorAction[] {
  return nextActions.reduce((acc, action) => upsertActionByRequirementId(acc, action), existing);
}

function getPlatoonLabel(targetPlatoonId: string | null | undefined, platoonLabels?: Record<string, string>): string {
  if (!targetPlatoonId) return '—';
  if (platoonLabels?.[targetPlatoonId]) return platoonLabels[targetPlatoonId];

  const parts = targetPlatoonId.split('::');
  if (parts.length < 3) return targetPlatoonId;
  const [phase, , platoonKey] = parts;
  const platoonMatch = platoonKey.match(/platoon-(\d+)$/i);
  const platoonNumber = platoonMatch ? platoonMatch[1] : platoonKey;
  return `Phase ${phase} · Platoon ${platoonNumber}`;
}

function formatAlternativeCost(missingRelicTiers: number, missingRarity: number): string {
  const parts: string[] = [];
  if (missingRelicTiers > 0) parts.push(missingRelicTiers === 1 ? '+1 relic' : `+${missingRelicTiers} relic`);
  if (missingRarity > 0) parts.push(missingRarity === 1 ? '+1 star' : `+${missingRarity} stars`);
  return parts.length > 0 ? parts.join(', ') : 'ready';
}

function describeAction(action: PlatoonSimulatorAction, lookups?: Lookups): string {
  const member = lookups?.memberNames[action.memberId] ?? action.playerName ?? action.memberId;
  const unit = lookups?.unitNames[action.unitBaseId] ?? action.unitName ?? action.unitBaseId;

  switch (action.type) {
    case 'USE_UNUSED_OWNER':
      return `${member} → ${unit}`;
    case 'UPGRADE_OWNER_UNIT':
      return `${member} → ${unit} (${formatAlternativeCost(action.missingRelicTiers, action.missingRarity)})`;
    case 'REMOVE_SOURCE_BLOCK':
      return `${member} → ${unit} (${action.blockType}${action.planetCategory ? ` · ${action.planetCategory}` : ''})`;
    default: {
      const exhaustiveCheck: never = action;
      return String(exhaustiveCheck);
    }
  }
}

function buildExportPlanText(params: {
  mode: PlannerMode;
  includedBonusZoneKeys: string[];
  bonusZoneOptions: BonusZoneOption[];
  autoTarget: AutoTarget;
  autoTargetOptions: AutoTargetOption[];
  lookups?: Lookups;
  activeActions: PlatoonSimulatorAction[];
  firstCandidate: SequentialFullPlatoonPlan['first'] | null;
  secondCandidate: SequentialFullPlatoonPlan['second'] | null;
  autoPlan?: AutoZonePlan | null;
}): string {
  const {
    mode,
    includedBonusZoneKeys,
    bonusZoneOptions,
    autoTarget,
    autoTargetOptions,
    lookups,
    activeActions,
    firstCandidate,
    secondCandidate,
    autoPlan,
  } = params;

  const lines: string[] = [];
  const includedBonusLabels = bonusZoneOptions
    .filter((zone) => includedBonusZoneKeys.includes(zone.zoneKey))
    .map((zone) => zone.label);

  const autoTargetLabel =
    autoTarget && autoTarget.kind === 'phase-category'
      ? autoTargetOptions.find(
          (option) =>
            option.phase === autoTarget.phase &&
            option.category === autoTarget.category,
        )?.label ?? `${autoTarget.phase} · ${autoTarget.category}`
      : 'None';

  lines.push('SWGOH TB Plan Export');
  lines.push(`Mode: ${mode === 'manual' ? 'Manual mode' : 'Auto mode'}`);
  lines.push(
    `Included bonus zones: ${includedBonusLabels.length ? includedBonusLabels.join(', ') : 'None'}`,
  );
  lines.push(`Auto target: ${autoTargetLabel}`);
  lines.push('');

  if (activeActions.length > 0) {
    lines.push('Active scenario actions');
    lines.push(`Count: ${activeActions.length}`);
    lines.push('');

    for (const action of activeActions) {
      lines.push(`- ${describeAction(action, lookups)}`);
    }

    return lines.join('\n');
  }

  if (mode === 'auto' && autoPlan) {
    lines.push('Auto plan target');
    lines.push(autoTargetLabel);
    lines.push(
      `Coverage: ${autoPlan.currentCoveredSlots}/${autoPlan.currentRequiredSlots} (${autoPlan.currentCoveragePercent}%) → ${autoPlan.projectedCoveredSlots}/${autoPlan.projectedRequiredSlots} (${autoPlan.projectedCoveragePercent}%)`,
    );
    lines.push(
      `Full platoons: ${autoPlan.currentFullPlatoons}/${autoPlan.totalPlatoons} → ${autoPlan.projectedFullPlatoons}/${autoPlan.totalPlatoons}`,
    );
    lines.push(`Zone complete: ${autoPlan.zoneComplete ? 'Yes' : 'No'}`);
    lines.push('');

    if (!autoPlan.steps.length) {
      lines.push('No auto plan steps available.');
      return lines.join('\n');
    }

    for (const step of autoPlan.steps) {
      lines.push(`Step ${step.stepNumber}`);
      lines.push(
        lookups?.platoonLabels?.[step.targetPlatoonId] ?? step.targetPlatoonId,
      );
      lines.push(
        `Target platoon: ${step.targetCoveredSlotsBefore}/15 → ${step.targetCoveredSlotsAfter}/15`,
      );
      lines.push(
        `Zone coverage: ${step.zoneCoveredSlotsBefore}/${step.zoneRequiredSlots} → ${step.zoneCoveredSlotsAfter}/${step.zoneRequiredSlots}`,
      );
      lines.push(
        `Zone full platoons: ${step.zoneFullPlatoonsBefore}/${autoPlan.totalPlatoons} → ${step.zoneFullPlatoonsAfter}/${autoPlan.totalPlatoons}`,
      );
      lines.push('Todos:');

      for (const action of step.actions) {
        lines.push(`- ${describeAction(action, lookups)}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  const appendCandidate = (
    title: string,
    candidate: SequentialFullPlatoonPlan['first'] | SequentialFullPlatoonPlan['second'] | null,
  ) => {
    if (!candidate) {
      lines.push(`${title}: No candidate`);
      lines.push('');
      return;
    }

    lines.push(title);
    lines.push(getPlatoonLabel(candidate.targetPlatoonId, lookups?.platoonLabels));
    lines.push(
      `Target covered: ${candidate.targetCoveredSlotsBefore} → ${candidate.targetCoveredSlotsAfter}`,
    );
    lines.push(
      `Target missing: ${candidate.targetMissingSlotsBefore} → ${candidate.targetMissingSlotsAfter}`,
    );
    lines.push(`Target becomes full: ${candidate.targetBecomesFull ? 'Yes' : 'No'}`);
    lines.push('Actions:');

    for (const action of candidate.actions) {
      lines.push(`- ${describeAction(action, lookups)}`);
    }

    lines.push('');
  };

  appendCandidate(
    mode === 'auto' ? 'Current auto step' : 'Current next full platoon',
    firstCandidate,
  );
  appendCandidate(
    mode === 'auto' ? 'Second auto step' : 'Second next full platoon',
    secondCandidate,
  );

  return lines.join('\n');
}

function buildExportFullNewAssignmentText(params: {
  mode: PlannerMode;
  includedBonusZoneKeys: string[];
  bonusZoneOptions: BonusZoneOption[];
  autoTarget: AutoTarget;
  autoTargetOptions: AutoTargetOption[];
  assignments: FullNewAssignment[];
}): string {
  const { mode, includedBonusZoneKeys, bonusZoneOptions, autoTarget, autoTargetOptions, assignments } = params;
  const lines: string[] = [];
  const includedBonusLabels = bonusZoneOptions.filter((zone) => includedBonusZoneKeys.includes(zone.zoneKey)).map((zone) => zone.label);
  const autoTargetLabel = autoTarget && autoTarget.kind === 'phase-category'
    ? autoTargetOptions.find((option) => option.phase === autoTarget.phase && option.category === autoTarget.category)?.label ?? `${autoTarget.phase} · ${autoTarget.category}`
    : 'None';

  lines.push('SWGOH TB Full New Assignment Export');
  lines.push(`Mode: ${mode === 'manual' ? 'Manual mode' : 'Auto mode'}`);
  lines.push(`Included bonus zones: ${includedBonusLabels.length ? includedBonusLabels.join(', ') : 'None'}`);
  lines.push(`Auto target: ${autoTargetLabel}`);
  lines.push('');

  let currentPlatoon = '';
  for (const assignment of assignments) {
    if (assignment.platoonLabel !== currentPlatoon) {
      currentPlatoon = assignment.platoonLabel;
      lines.push(currentPlatoon);
    }
    lines.push(`  Slot ${assignment.slotNumber}: ${assignment.playerName} → ${assignment.unitName}`);
  }
  return lines.join('\n');
}

async function copyOrDownloadText(text: string, filename: string): Promise<void> {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CandidateCard({ title, candidate, onApplyOne, onApplyAll, onReplaceOne, canApply, lookups }: {
  title: string;
  candidate: SequentialFullPlatoonPlan['first'] | SequentialFullPlatoonPlan['second'] | null;
  onApplyOne: (action: PlatoonSimulatorAction) => void;
  onApplyAll: (actions: PlatoonSimulatorAction[]) => void;
  onReplaceOne: (currentAction: PlatoonSimulatorAction, replacement: PlatoonSimulatorAction) => void;
  canApply: boolean;
  lookups?: Lookups;
}) {
  if (!candidate) {
    return (
      <section className="card animate-fade-in">
        <div className="metric-label">{title}</div>
        <h2 className="mt-2 text-2xl font-bold">No candidate</h2>
        <p className="mt-3 text-[var(--color-text-muted)]">Kein vollständig machbarer nächster Platoon-Pfad gefunden.</p>
      </section>
    );
  }

  const changedAssignmentCount = 'changedAssignmentCount' in candidate && typeof candidate.changedAssignmentCount === 'number'
    ? candidate.changedAssignmentCount
    : null;

  return (
    <section className="card animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="metric-label">{title}</div>
          <h2 className="mt-2 text-2xl font-bold">{getPlatoonLabel(candidate.targetPlatoonId, lookups?.platoonLabels)}</h2>
        </div>
        <button 
          type="button" 
          onClick={() => onApplyAll(candidate.actions)} 
          disabled={!canApply || candidate.actions.length === 0} 
          className="btn btn-primary"
        >
          Apply all
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="stat-card">
          <div className="stat-label">Suggested actions</div>
          <div className="stat-value">{candidate.actions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Delta full platoons</div>
          <div className="stat-value">{candidate.deltaFullPlatoons}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Delta covered slots</div>
          <div className="stat-value">{candidate.deltaCoveredSlots}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Changed assignments</div>
          <div className="stat-value">{changedAssignmentCount ?? '—'}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="stat-card">
          <div className="stat-label">Target covered</div>
          <div className="stat-value text-lg">{candidate.targetCoveredSlotsBefore} → {candidate.targetCoveredSlotsAfter}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Target missing</div>
          <div className="stat-value text-lg">{candidate.targetMissingSlotsBefore} → {candidate.targetMissingSlotsAfter}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Target becomes full</div>
          <div className="stat-value text-lg">{candidate.targetBecomesFull ? 'Yes' : 'No'}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 text-sm font-semibold text-[var(--color-text-muted)]">Suggested real actions</div>
        {candidate.actions.length === 0 ? (
          <div className="card text-center text-[var(--color-text-muted)]">Keine Aktionen vorgeschlagen.</div>
        ) : (
          <div className="space-y-3">
            {candidate.actions.map((action) => (
              <div key={getActionKey(action)} className="stat-card">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{describeAction(action, lookups)}</div>
                    <div className="mt-1 text-sm text-[var(--color-text-muted)]">{getActionTypeLabel(action)}</div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => onApplyOne(action)} 
                    disabled={!canApply} 
                    className="btn btn-secondary"
                  >
                    Apply
                  </button>
                </div>

                {'alternatives' in action && action.alternatives && action.alternatives.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold text-[var(--color-text-muted)]">Alternatives</div>
                    {action.alternatives.map((alt, index) => {
                      const replacement: PlatoonSimulatorAction = action.type === 'USE_UNUSED_OWNER'
                        ? { ...action, id: `${action.id}::alt::${alt.memberId}::${index}`, memberId: alt.memberId, playerName: alt.playerName, unitBaseId: alt.unitBaseId, unitName: alt.unitName, missingRelicTiers: 0, missingRarity: 0 }
                        : action.type === 'UPGRADE_OWNER_UNIT'
                          ? { ...action, id: `${action.id}::alt::${alt.memberId}::${index}`, memberId: alt.memberId, playerName: alt.playerName, unitBaseId: alt.unitBaseId, unitName: alt.unitName, missingRelicTiers: alt.missingRelicTiers, missingRarity: alt.missingRarity, actionCost: alt.actionCost }
                          : action;

                      return (
                        <div key={`${action.id}::alt::${alt.memberId}::${index}`} className="flex flex-col gap-2 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                          <div className="text-xs text-[var(--color-text-secondary)]">{alt.playerName} → {alt.unitName} ({formatAlternativeCost(alt.missingRelicTiers, alt.missingRarity)})</div>
                          <button 
                            type="button" 
                            onClick={() => onReplaceOne(action, replacement)} 
                            disabled={!canApply} 
                            className="btn btn-ghost text-xs"
                          >
                            Use this instead
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ label, value, big = true }: { label: string; value: string | number; big?: boolean }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${big ? 'text-3xl' : 'text-xl'}`}>{value}</div>
    </div>
  );
}

function AutoPlanCard({ plan, lookups, canApply, onApplyAll }: { plan: AutoZonePlan | null; lookups?: Lookups; canApply: boolean; onApplyAll: (actions: PlatoonSimulatorAction[]) => void }) {
  if (!plan) {
    return (
      <section className="card animate-fade-in">
        <div className="metric-label">Auto plan</div>
        <h2 className="mt-2 text-2xl font-bold">No plan</h2>
        <p className="mt-3 text-[var(--color-text-muted)]">Kein vollständiger Auto-Plan für die gewählte Zone gefunden.</p>
      </section>
    );
  }

  return (
    <section className="card card-glow-blue animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="metric-label">Auto plan</div>
          <h2 className="mt-2 text-2xl font-bold">Phase {plan.target.phase} · {plan.target.category}</h2>
          <div className="mt-2 text-[var(--color-text-secondary)]">
            Coverage {plan.currentCoveredSlots}/{plan.currentRequiredSlots} ({plan.currentCoveragePercent}%) → {plan.projectedCoveredSlots}/{plan.projectedRequiredSlots} ({plan.projectedCoveragePercent}%)
          </div>
          <div className="mt-1 text-[var(--color-text-secondary)]">
            Full platoons {plan.currentFullPlatoons}/{plan.totalPlatoons} → {plan.projectedFullPlatoons}/{plan.totalPlatoons}
          </div>
        </div>
        <button 
          type="button" 
          onClick={() => onApplyAll(plan.combinedActions)} 
          disabled={!canApply || plan.combinedActions.length === 0} 
          className="btn btn-primary"
        >
          Apply full auto plan
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="stat-card">
          <div className="stat-label">Planned steps</div>
          <div className="stat-value">{plan.steps.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Projected covered slots</div>
          <div className="stat-value">+{plan.projectedCoveredSlots - plan.currentCoveredSlots}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Projected full platoons</div>
          <div className="stat-value">+{plan.projectedFullPlatoons - plan.currentFullPlatoons}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Zone complete</div>
          <div className="stat-value text-lg">{plan.zoneComplete ? 'Yes' : 'No'}</div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {plan.steps.map((step) => (
          <div key={`${step.stepNumber}-${step.targetPlatoonId}`} className="stat-card">
            <div className="text-xs font-semibold text-[var(--color-text-muted)]">Step {step.stepNumber}</div>
            <div className="mt-1 text-lg font-semibold">{getPlatoonLabel(step.targetPlatoonId, lookups?.platoonLabels)}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
              <div>Target: {step.targetCoveredSlotsBefore} → {step.targetCoveredSlotsAfter}</div>
              <div>Zone coverage: {step.zoneCoveredSlotsBefore}/{step.zoneRequiredSlots} → {step.zoneCoveredSlotsAfter}/{step.zoneRequiredSlots}</div>
              <div>Zone platoons: {step.zoneFullPlatoonsBefore} → {step.zoneFullPlatoonsAfter}</div>
              <div>Displaced: {step.displacedAssignmentCount}</div>
            </div>
            <div className="mt-4 space-y-2">
              {step.actions.map((action) => (
                <div key={getActionKey(action)} className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm">
                  {describeAction(action, lookups)}
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">{getActionTypeLabel(action)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PublicGuildSimulatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string>('');
  const [actions, setActions] = useState<PlatoonSimulatorAction[]>([]);
  const [data, setData] = useState<SimulatorApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedActions, setDebouncedActions] = useState<PlatoonSimulatorAction[]>([]);
  const [includedBonusZoneKeys, setIncludedBonusZoneKeys] = useState<string[]>([]);
  const [mode, setMode] = useState<PlannerMode>('manual');
  const [autoTarget, setAutoTarget] = useState<AutoTarget>(null);
  const [exportPlanState, setExportPlanState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [exportFullState, setExportFullState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    params.then((resolved) => {
      if (!cancelled) setSlug(resolved.slug);
    });
    return () => { cancelled = true; };
  }, [params]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedActions(actions), 350);
    return () => window.clearTimeout(timeoutId);
  }, [actions]);

  useEffect(() => {
    if (!slug) return;

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120000);

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/public/guild/${slug}/simulator`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actions: debouncedActions, includedBonusZoneKeys, mode, autoTarget }),
          signal: controller.signal,
        });

        const raw = await res.text();
        let parsed: SimulatorApiResponse | ErrorResponse | null = null;

        try {
          parsed = raw ? (JSON.parse(raw) as SimulatorApiResponse | ErrorResponse) : null;
        } catch {
          throw new Error(raw ? `Simulator API returned non-JSON response: ${raw.slice(0, 200)}` : 'Simulator API returned empty response');
        }

        if (!res.ok) {
          throw new Error(parsed && 'error' in parsed ? parsed.error : 'Simulation request failed');
        }

        if (requestId === requestIdRef.current) setData(parsed as SimulatorApiResponse);
      } catch (err) {
        console.error(err);
        if (requestId === requestIdRef.current) {
          setData(null);
          if (err instanceof DOMException && err.name === 'AbortError') {
            setError('Simulation request timed out');
          } else {
            setError(err instanceof Error ? err.message : 'Simulation request failed');
          }
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }

    run();
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [slug, debouncedActions, includedBonusZoneKeys, mode, autoTarget]);

  const summary = useMemo(() => data?.simulation.delta ?? null, [data]);
  const firstCandidate = data?.advisory.first ?? null;
  const secondCandidate = data?.advisory.second ?? null;
  const autoPlan = data?.autoPlan ?? null;
  const lookups = data?.lookups;
  const bonusZoneOptions = data?.bonusZoneOptions ?? [];
  const autoTargetOptions = data?.autoTargetOptions ?? [];
  const fullNewAssignments = data?.fullNewAssignments ?? [];
  const guildName = data?.guildName ?? slug;

  const newlyFullLabels = useMemo(() => {
    if (!summary?.becameFullPlatoonIds?.length) return [];
    return summary.becameFullPlatoonIds.map((id) => lookups?.platoonLabels?.[id] ?? id);
  }, [summary, lookups]);

  function applyOne(action: PlatoonSimulatorAction) { setActions((prev) => upsertActionByRequirementId(prev, action)); }
  function applyAll(nextActions: PlatoonSimulatorAction[]) { setActions((prev) => mergeActions(prev, nextActions)); }
  function removeAction(action: PlatoonSimulatorAction) { const keyToRemove = getActionKey(action); setActions((prev) => prev.filter((item) => getActionKey(item) !== keyToRemove)); }
  function replaceAction(_currentAction: PlatoonSimulatorAction, replacement: PlatoonSimulatorAction) { setActions((prev) => upsertActionByRequirementId(prev, replacement)); }
  function resetScenario() { setActions([]); }

  function toggleBonusZone(zoneKey: string) {
    setIncludedBonusZoneKeys((prev) => prev.includes(zoneKey) ? prev.filter((item) => item !== zoneKey) : [...prev, zoneKey]);
  }

  function handleModeChange(nextMode: PlannerMode) {
    setMode(nextMode);
    if (nextMode === 'manual') {
      setAutoTarget(null);
    } else if (!autoTarget && autoTargetOptions.length > 0) {
      const first = autoTargetOptions[0];
      setAutoTarget({ kind: 'phase-category', phase: first.phase, category: first.category });
    }
  }

  function handleAutoTargetChange(value: string) {
    if (!value) {
      setAutoTarget(null);
      return;
    }
    const [phaseRaw, categoryRaw] = value.split('::');
    const phase = Number(phaseRaw);
    const category = categoryRaw as PlanetCategory;
    if (!Number.isFinite(phase) || !category) {
      setAutoTarget(null);
      return;
    }
    setAutoTarget({ kind: 'phase-category', phase, category });
  }

  async function exportPlan() {
    const text = buildExportPlanText({
      mode,
      includedBonusZoneKeys,
      bonusZoneOptions,
      autoTarget,
      autoTargetOptions,
      lookups,
      activeActions: actions,
      firstCandidate,
      secondCandidate,
      autoPlan,
    });
    try {
      await copyOrDownloadText(text, 'swgoh-tb-plan.txt');
      setExportPlanState('copied');
    } catch {
      setExportPlanState('failed');
    } finally {
      window.setTimeout(() => setExportPlanState('idle'), 2000);
    }
  }

  async function exportFullNewAssignment() {
    const text = buildExportFullNewAssignmentText({ mode, includedBonusZoneKeys, bonusZoneOptions, autoTarget, autoTargetOptions, assignments: fullNewAssignments });
    try {
      await copyOrDownloadText(text, 'swgoh-tb-full-new-assignment.txt');
      setExportFullState('copied');
    } catch {
      setExportFullState('failed');
    } finally {
      window.setTimeout(() => setExportFullState('idle'), 2000);
    }
  }

  const selectedAutoTargetValue = autoTarget && autoTarget.kind === 'phase-category' ? `${autoTarget.phase}::${autoTarget.category}` : '';

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <header className="mb-8 animate-fade-in">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Public guild simulator</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                Platoon Simulator · {guildName}
              </h1>
              <p className="mt-3 max-w-3xl text-[var(--color-text-secondary)]">
                Manual mode für konkrete Entscheidungen je Slot. Auto mode baut automatisch einen umsetzbaren Plan für die ausgewählte unvollständige Zone.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {/* Mode Toggle */}
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border-primary)] p-1">
                <button 
                  type="button" 
                  onClick={() => handleModeChange('manual')} 
                  className={`btn ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Manual mode
                </button>
                <button 
                  type="button" 
                  onClick={() => handleModeChange('auto')} 
                  className={`btn ${mode === 'auto' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Auto mode
                </button>
              </div>

              {/* Export Buttons */}
              <button 
                type="button" 
                onClick={exportPlan} 
                className="btn btn-secondary"
              >
                {exportPlanState === 'copied' ? '✓ Plan exported' : exportPlanState === 'failed' ? '✗ Export failed' : 'Export Plan'}
              </button>
              <button 
                type="button" 
                onClick={exportFullNewAssignment} 
                className="btn btn-secondary"
              >
                {exportFullState === 'copied' ? '✓ Exported' : exportFullState === 'failed' ? '✗ Failed' : 'Export Full Assignment'}
              </button>
              <button 
                type="button" 
                onClick={resetScenario} 
                disabled={actions.length === 0} 
                className="btn btn-danger"
              >
                Reset scenario
              </button>
            </div>
          </div>
        </header>

        {/* Settings Card */}
        <section className="card mb-8 animate-fade-in">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Bonus Zones */}
            <div>
              <div className="metric-label">Bonus zones</div>
              <div className="mt-4 flex flex-wrap gap-3">
                {bonusZoneOptions.length === 0 ? (
                  <div className="text-sm text-[var(--color-text-muted)]">No bonus zones available.</div>
                ) : (
                  bonusZoneOptions.map((zone) => {
                    const checked = includedBonusZoneKeys.includes(zone.zoneKey);
                    return (
                      <label key={zone.zoneKey} className="flex items-center gap-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={checked} 
                          onChange={() => toggleBonusZone(zone.zoneKey)} 
                          className="h-4 w-4 rounded border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
                        />
                        <span>{zone.label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Auto Target */}
            <div>
              <div className="metric-label">Auto target</div>
              <div className="mt-4">
                <select 
                  value={selectedAutoTargetValue} 
                  onChange={(e) => handleAutoTargetChange(e.target.value)} 
                  disabled={mode !== 'auto'} 
                  className="select"
                >
                  <option value="">Select target zone</option>
                  {autoTargetOptions.map((option) => (
                    <option key={`${option.phase}::${option.category}`} value={`${option.phase}::${option.category}`}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Im Auto mode sind nur unvollständige Zonen auswählbar.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Error Banner */}
        {error && (
          <div className="mb-8 card card-glow-rose animate-fade-in">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-[var(--color-accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Simulator API failed: {error}</span>
            </div>
          </div>
        )}

        {/* Stats */}
        <section className="mb-8 grid gap-4 md:grid-cols-5 animate-fade-in">
          <div className="metric-card">
            <div className="metric-label">Covered slots</div>
            <div className="metric-value">{summary ? summary.simulatedCoveredSlots : '—'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Full platoons</div>
            <div className="metric-value">{summary ? summary.simulatedFullPlatoons : '—'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Full zones</div>
            <div className="metric-value">{summary ? summary.simulatedFullZones : '—'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Changed assignments</div>
            <div className="metric-value">{summary ? summary.changedAssignmentCount : '—'}</div>
          </div>
          <div className={`metric-card ${newlyFullLabels.length > 0 ? 'card-glow-emerald' : ''}`}>
            <div className="metric-label">Newly full</div>
            <div className="metric-value">{newlyFullLabels.length || '0'}</div>
            <div className="mt-2 text-sm text-[var(--color-text-muted)]">
              {newlyFullLabels.length ? newlyFullLabels.join(', ') : 'No newly completed platoons'}
            </div>
          </div>
        </section>

        {/* Main Content */}
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          {/* Active Scenario Sidebar */}
          <aside className="card animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Active scenario</h2>
                <div className="mt-1 text-sm text-[var(--color-text-muted)]">Actions currently applied</div>
              </div>
              <div className={`text-xs font-medium ${loading ? 'animate-pulse text-[var(--color-accent-blue)]' : 'text-[var(--color-text-muted)]'}`}>
                {loading ? 'Recalculating…' : 'Auto-updated'}
              </div>
            </div>

            <div className="mt-5 stat-card">
              <div className="stat-label">Applied actions</div>
              <div className="stat-value text-4xl">{actions.length}</div>
            </div>

            <div className="mt-5 space-y-3">
              {actions.length === 0 ? (
                <div className="stat-card text-center text-[var(--color-text-muted)]">
                  Noch keine Aktionen aktiv.
                </div>
              ) : (
                actions.map((action) => (
                  <div key={getActionKey(action)} className="stat-card">
                    <div className="font-medium">{describeAction(action, lookups)}</div>
                    <div className="mt-1 text-sm text-[var(--color-text-muted)]">{getActionTypeLabel(action)}</div>
                    <button 
                      type="button" 
                      onClick={() => removeAction(action)} 
                      className="mt-3 btn btn-danger text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            {data && (
              <div className="mt-5 stat-card">
                <div className="stat-label">Scenario effect</div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Delta covered slots</span>
                    <span className="font-semibold">{data.simulation.delta.deltaCoveredSlots ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Delta full platoons</span>
                    <span className="font-semibold">{data.simulation.delta.deltaFullPlatoons ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Delta full zones</span>
                    <span className="font-semibold">{data.simulation.delta.deltaFullZones ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Displaced assignments</span>
                    <span className="font-semibold">{data.simulation.delta.displacedAssignmentCount ?? '—'}</span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Main Planning Area */}
          <section className="space-y-6">
            {mode === 'auto' ? (
              <AutoPlanCard plan={autoPlan} lookups={lookups} canApply={!loading} onApplyAll={applyAll} />
            ) : (
              <>
                <CandidateCard title="Current next full platoon" candidate={firstCandidate} onApplyOne={applyOne} onApplyAll={applyAll} onReplaceOne={replaceAction} canApply={!loading} lookups={lookups} />
                <CandidateCard title="Second next full platoon" candidate={secondCandidate} onApplyOne={applyOne} onApplyAll={applyAll} onReplaceOne={replaceAction} canApply={!loading} lookups={lookups} />
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}