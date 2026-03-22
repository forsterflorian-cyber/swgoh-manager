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
      <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
        <div className="text-sm text-slate-400">{title}</div>
        <h2 className="mt-1 text-2xl font-semibold text-white">No candidate</h2>
        <p className="mt-3 text-sm text-slate-400">Kein vollständig machbarer nächster Platoon-Pfad gefunden.</p>
      </section>
    );
  }

  const changedAssignmentCount = 'changedAssignmentCount' in candidate && typeof candidate.changedAssignmentCount === 'number'
    ? candidate.changedAssignmentCount
    : null;

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm text-slate-400">{title}</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">{getPlatoonLabel(candidate.targetPlatoonId, lookups?.platoonLabels)}</h2>
        </div>
        <button type="button" onClick={() => onApplyAll(candidate.actions)} disabled={!canApply || candidate.actions.length === 0} className="rounded-2xl border border-indigo-700/70 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50">Apply all</button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Suggested actions" value={candidate.actions.length} />
        <StatCard label="Delta full platoons" value={candidate.deltaFullPlatoons} />
        <StatCard label="Delta covered slots" value={candidate.deltaCoveredSlots} />
        <StatCard label="Changed assignments" value={changedAssignmentCount ?? '—'} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Target covered" value={`${candidate.targetCoveredSlotsBefore} → ${candidate.targetCoveredSlotsAfter}`} big={false} />
        <StatCard label="Target missing" value={`${candidate.targetMissingSlotsBefore} → ${candidate.targetMissingSlotsAfter}`} big={false} />
        <StatCard label="Target becomes full" value={candidate.targetBecomesFull ? 'Yes' : 'No'} big={false} />
      </div>

      <div className="mt-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Suggested real actions</div>
        {candidate.actions.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-black/20 p-4 text-sm text-slate-400">Keine Aktionen vorgeschlagen.</div>
        ) : (
          <div className="space-y-3">
            {candidate.actions.map((action) => (
              <div key={getActionKey(action)} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-black/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">{describeAction(action, lookups)}</div>
                    <div className="mt-1 text-xs text-slate-500">{getActionTypeLabel(action)}</div>
                  </div>
                  <button type="button" onClick={() => onApplyOne(action)} disabled={!canApply} className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
                </div>

                {'alternatives' in action && action.alternatives && action.alternatives.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Alternatives</div>
                    {action.alternatives.map((alt, index) => {
                      const replacement: PlatoonSimulatorAction = action.type === 'USE_UNUSED_OWNER'
                        ? { ...action, id: `${action.id}::alt::${alt.memberId}::${index}`, memberId: alt.memberId, playerName: alt.playerName, unitBaseId: alt.unitBaseId, unitName: alt.unitName, missingRelicTiers: 0, missingRarity: 0 }
                        : action.type === 'UPGRADE_OWNER_UNIT'
                          ? { ...action, id: `${action.id}::alt::${alt.memberId}::${index}`, memberId: alt.memberId, playerName: alt.playerName, unitBaseId: alt.unitBaseId, unitName: alt.unitName, missingRelicTiers: alt.missingRelicTiers, missingRarity: alt.missingRarity, actionCost: alt.actionCost }
                          : action;

                      return (
                        <div key={`${action.id}::alt::${alt.memberId}::${index}`} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                          <div className="text-xs text-slate-300">{alt.playerName} → {alt.unitName} ({formatAlternativeCost(alt.missingRelicTiers, alt.missingRarity)})</div>
                          <button type="button" onClick={() => onReplaceOne(action, replacement)} disabled={!canApply} className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">Use this instead</button>
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
    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-2 font-semibold text-white ${big ? 'text-3xl' : 'text-2xl'}`}>{value}</div>
    </div>
  );
}

function AutoPlanCard({ plan, lookups, canApply, onApplyAll }: { plan: AutoZonePlan | null; lookups?: Lookups; canApply: boolean; onApplyAll: (actions: PlatoonSimulatorAction[]) => void }) {
  if (!plan) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
        <div className="text-sm text-slate-400">Auto plan</div>
        <h2 className="mt-1 text-2xl font-semibold text-white">No plan</h2>
        <p className="mt-3 text-sm text-slate-400">Kein vollständiger Auto-Plan für die gewählte Zone gefunden.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm text-slate-400">Auto plan</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Phase {plan.target.phase} · {plan.target.category}</h2>
          <div className="mt-2 text-sm text-slate-400">Coverage {plan.currentCoveredSlots}/{plan.currentRequiredSlots} ({plan.currentCoveragePercent}%) → {plan.projectedCoveredSlots}/{plan.projectedRequiredSlots} ({plan.projectedCoveragePercent}%)</div>
          <div className="mt-1 text-sm text-slate-400">Full platoons {plan.currentFullPlatoons}/{plan.totalPlatoons} → {plan.projectedFullPlatoons}/{plan.totalPlatoons}</div>
        </div>
        <button type="button" onClick={() => onApplyAll(plan.combinedActions)} disabled={!canApply || plan.combinedActions.length === 0} className="rounded-2xl border border-indigo-700/70 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50">Apply full auto plan</button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Planned steps" value={plan.steps.length} />
        <StatCard label="Projected covered slots" value={plan.projectedCoveredSlots - plan.currentCoveredSlots} />
        <StatCard label="Projected full platoons" value={plan.projectedFullPlatoons - plan.currentFullPlatoons} />
        <StatCard label="Zone complete" value={plan.zoneComplete ? 'Yes' : 'No'} />
      </div>

      <div className="mt-6 space-y-4">
        {plan.steps.map((step) => (
          <div key={`${step.stepNumber}-${step.targetPlatoonId}`} className="rounded-2xl border border-slate-800 bg-black/20 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step {step.stepNumber}</div>
            <div className="mt-1 text-lg font-semibold text-white">{getPlatoonLabel(step.targetPlatoonId, lookups?.platoonLabels)}</div>
            <div className="mt-2 grid gap-3 md:grid-cols-4">
              <div className="text-sm text-slate-300">Target: {step.targetCoveredSlotsBefore} → {step.targetCoveredSlotsAfter}</div>
              <div className="text-sm text-slate-300">Zone coverage: {step.zoneCoveredSlotsBefore}/{step.zoneRequiredSlots} → {step.zoneCoveredSlotsAfter}/{step.zoneRequiredSlots}</div>
              <div className="text-sm text-slate-300">Zone platoons: {step.zoneFullPlatoonsBefore} → {step.zoneFullPlatoonsAfter}</div>
              <div className="text-sm text-slate-300">Displaced: {step.displacedAssignmentCount}</div>
            </div>
            <div className="mt-4 space-y-2">
              {step.actions.map((action) => (
                <div key={getActionKey(action)} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100">
                  {describeAction(action, lookups)}
                  <div className="mt-1 text-xs text-slate-500">{getActionTypeLabel(action)}</div>
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
}); try {
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
    <main className="min-h-screen bg-gray-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-slate-400">Public guild simulator</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Next Full Platoon Simulator</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">Manual mode für konkrete Entscheidungen je Slot. Auto mode baut automatisch einen umsetzbaren Plan für die ausgewählte unvollständige Zone.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#020817] p-1">
              <button type="button" onClick={() => handleModeChange('manual')} className={`rounded-xl px-4 py-2 text-sm transition ${mode === 'manual' ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-300 hover:bg-slate-800'}`}>Manual mode</button>
              <button type="button" onClick={() => handleModeChange('auto')} className={`rounded-xl px-4 py-2 text-sm transition ${mode === 'auto' ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-300 hover:bg-slate-800'}`}>Auto mode</button>
            </div>

            <button type="button" onClick={exportPlan} className="rounded-2xl border border-emerald-700/70 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-200 transition hover:bg-emerald-500/20">{exportPlanState === 'copied' ? 'Plan exported' : exportPlanState === 'failed' ? 'Plan export failed' : 'Export Plan'}</button>
            <button type="button" onClick={exportFullNewAssignment} className="rounded-2xl border border-cyan-700/70 bg-cyan-500/10 px-5 py-3 text-sm text-cyan-200 transition hover:bg-cyan-500/20">{exportFullState === 'copied' ? 'Assignment exported' : exportFullState === 'failed' ? 'Assignment export failed' : 'Export Full New Assignment'}</button>
            <button type="button" onClick={resetScenario} disabled={actions.length === 0} className="rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">Reset scenario</button>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-gray-800 bg-gray-950/70 p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="text-sm text-slate-400">Bonus zones</div>
              <div className="mt-4 flex flex-wrap gap-3">
                {bonusZoneOptions.length === 0 ? <div className="text-sm text-slate-500">No bonus zones available.</div> : bonusZoneOptions.map((zone) => {
                  const checked = includedBonusZoneKeys.includes(zone.zoneKey);
                  return (
                    <label key={zone.zoneKey} className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-black/20 px-4 py-3 text-sm text-slate-200">
                      <input type="checkbox" checked={checked} onChange={() => toggleBonusZone(zone.zoneKey)} className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500" />
                      <span>{zone.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-400">Auto target</div>
              <div className="mt-4">
                <select value={selectedAutoTargetValue} onChange={(e) => handleAutoTargetChange(e.target.value)} disabled={mode !== 'auto'} className="w-full rounded-2xl border border-slate-800 bg-[#0f172a] px-4 py-3 text-sm text-slate-100 outline-none transition disabled:cursor-not-allowed disabled:opacity-50">
                  <option value="" className="bg-[#0f172a] text-slate-400">Select target zone</option>
                  {autoTargetOptions.map((option) => (
                    <option key={`${option.phase}::${option.category}`} value={`${option.phase}::${option.category}`} className="bg-[#0f172a] text-slate-100">{option.label}</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-slate-500">Im Auto mode sind nur unvollständige Zonen auswählbar.</div>
              </div>
            </div>
          </div>
        </div>

        {error ? <div className="mb-8 rounded-3xl border border-rose-900/60 bg-rose-950/30 p-5 text-sm text-rose-200">Simulator API failed: {error}</div> : null}

        <div className="mb-8 grid gap-4 md:grid-cols-5">
          <StatCard label="Covered slots" value={summary ? summary.simulatedCoveredSlots : '—'} />
          <StatCard label="Full platoons" value={summary ? summary.simulatedFullPlatoons : '—'} />
          <StatCard label="Full zones" value={summary ? summary.simulatedFullZones : '—'} />
          <StatCard label="Changed assignments" value={summary ? summary.changedAssignmentCount : '—'} />
          <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
            <div className="text-xs text-slate-400">Newly full</div>
            <div className="mt-2 text-3xl font-semibold text-white">{newlyFullLabels.length ? newlyFullLabels.length : '0'}</div>
            <div className="mt-2 break-words text-sm text-slate-500">{newlyFullLabels.length ? newlyFullLabels.join(', ') : 'No newly completed platoons'}</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-gray-800 bg-gray-950/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Active scenario</h2>
                <div className="mt-1 text-sm text-slate-400">Actions currently applied</div>
              </div>
              <div className={`text-xs font-medium ${loading ? 'animate-pulse text-rose-400' : 'text-slate-500'}`}>{loading ? 'Recalculating…' : 'Auto-updated'}</div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-black/20 p-4">
              <div className="text-sm text-slate-400">Applied actions</div>
              <div className="mt-2 text-4xl font-semibold text-white">{actions.length}</div>
            </div>

            <div className="mt-5 space-y-3">
              {actions.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-black/20 p-4 text-sm text-slate-400">Noch keine Aktionen aktiv.</div>
              ) : actions.map((action) => (
                <div key={getActionKey(action)} className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                  <div className="text-sm font-medium text-slate-100">{describeAction(action, lookups)}</div>
                  <div className="mt-1 text-xs text-slate-500">{getActionTypeLabel(action)}</div>
                  <button type="button" onClick={() => removeAction(action)} className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800">Remove</button>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-black/20 p-4">
              <div className="text-sm text-slate-400">Scenario effect</div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3"><span>Delta covered slots</span><span>{data?.simulation.delta.deltaCoveredSlots ?? '—'}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Delta full platoons</span><span>{data?.simulation.delta.deltaFullPlatoons ?? '—'}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Delta full zones</span><span>{data?.simulation.delta.deltaFullZones ?? '—'}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Displaced assignments</span><span>{data?.simulation.delta.displacedAssignmentCount ?? '—'}</span></div>
              </div>
            </div>
          </aside>

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
    </main>
  );
}
