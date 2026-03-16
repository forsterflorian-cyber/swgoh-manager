'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorResponse,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';

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

type SimulatorApiResponse = {
  simulation: PlatoonSimulatorResponse;
  advisory: SequentialFullPlatoonPlan;
  lookups: Lookups;
  settings?: {
    includedBonusZoneKeys?: string[];
    mode?: PlannerMode;
  };
  bonusZoneOptions?: BonusZoneOption[];
  fullNewAssignments?: FullNewAssignment[];
};

type ErrorResponse = {
  error: string;
};

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
  if (typeof action.id === 'string' && action.id.length > 0) {
    return action.id;
  }

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

function upsertActionByRequirementId(
  existing: PlatoonSimulatorAction[],
  action: PlatoonSimulatorAction,
): PlatoonSimulatorAction[] {
  if (!('requirementId' in action) || typeof action.requirementId !== 'string') {
    return dedupeActions([...existing, action]);
  }

  const filtered = existing.filter((item) => {
    if (!('requirementId' in item)) {
      return true;
    }

    return item.requirementId !== action.requirementId;
  });

  return dedupeActions([...filtered, action]);
}

function mergeActions(
  existing: PlatoonSimulatorAction[],
  nextActions: PlatoonSimulatorAction[],
): PlatoonSimulatorAction[] {
  return nextActions.reduce((acc, action) => upsertActionByRequirementId(acc, action), existing);
}

function getPlatoonLabel(
  targetPlatoonId: string | null | undefined,
  platoonLabels?: Record<string, string>,
): string {
  if (!targetPlatoonId) return '—';

  if (platoonLabels?.[targetPlatoonId]) {
    return platoonLabels[targetPlatoonId];
  }

  const parts = targetPlatoonId.split('::');
  if (parts.length < 3) return targetPlatoonId;

  const [phase, , platoonKey] = parts;
  const platoonMatch = platoonKey.match(/platoon-(\d+)$/i);
  const platoonNumber = platoonMatch ? platoonMatch[1] : platoonKey;

  return `Phase ${phase} · Platoon ${platoonNumber}`;
}

function formatAlternativeCost(
  missingRelicTiers: number,
  missingRarity: number,
): string {
  const parts: string[] = [];

  if (missingRelicTiers > 0) {
    parts.push(
      missingRelicTiers === 1
        ? '+1 relic'
        : `+${missingRelicTiers} relic`,
    );
  }

  if (missingRarity > 0) {
    parts.push(
      missingRarity === 1
        ? '+1 star'
        : `+${missingRarity} stars`,
    );
  }

  return parts.length > 0 ? parts.join(', ') : 'ready';
}

function describeAction(action: PlatoonSimulatorAction, lookups?: Lookups): string {
  const member = lookups?.memberNames[action.memberId] ?? action.playerName ?? action.memberId;
  const unit = lookups?.unitNames[action.unitBaseId] ?? action.unitName ?? action.unitBaseId;

  switch (action.type) {
    case 'USE_UNUSED_OWNER':
      return `${member} → ${unit}`;

    case 'UPGRADE_OWNER_UNIT':
      return `${member} → ${unit} (${formatAlternativeCost(
        action.missingRelicTiers,
        action.missingRarity,
      )})`;

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
  lookups?: Lookups;
  activeActions: PlatoonSimulatorAction[];
  firstCandidate: SequentialFullPlatoonPlan['first'] | null;
  secondCandidate: SequentialFullPlatoonPlan['second'] | null;
}): string {
  const {
    mode,
    includedBonusZoneKeys,
    bonusZoneOptions,
    lookups,
    activeActions,
    firstCandidate,
    secondCandidate,
  } = params;

  const lines: string[] = [];
  const includedBonusLabels = bonusZoneOptions
    .filter((zone) => includedBonusZoneKeys.includes(zone.zoneKey))
    .map((zone) => zone.label);

  lines.push('SWGOH TB Plan Export');
  lines.push(`Mode: ${mode === 'manual' ? 'Manual mode' : 'Auto mode'}`);
  lines.push(
    `Included bonus zones: ${includedBonusLabels.length ? includedBonusLabels.join(', ') : 'None'}`,
  );
  lines.push('');

  if (activeActions.length > 0) {
    lines.push('Active scenario actions');
    for (const action of activeActions) {
      lines.push(`- ${describeAction(action, lookups)}`);
    }
    lines.push('');
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

  appendCandidate('Current next full platoon', firstCandidate);
  appendCandidate('Second next full platoon', secondCandidate);

  return lines.join('\n');
}

function buildExportFullNewAssignmentText(params: {
  mode: PlannerMode;
  includedBonusZoneKeys: string[];
  bonusZoneOptions: BonusZoneOption[];
  assignments: FullNewAssignment[];
}): string {
  const { mode, includedBonusZoneKeys, bonusZoneOptions, assignments } = params;

  const lines: string[] = [];
  const includedBonusLabels = bonusZoneOptions
    .filter((zone) => includedBonusZoneKeys.includes(zone.zoneKey))
    .map((zone) => zone.label);

  lines.push('SWGOH TB Full New Assignment Export');
  lines.push(`Mode: ${mode === 'manual' ? 'Manual mode' : 'Auto mode'}`);
  lines.push(
    `Included bonus zones: ${includedBonusLabels.length ? includedBonusLabels.join(', ') : 'None'}`,
  );
  lines.push('');

  let currentPlatoon = '';

  for (const assignment of assignments) {
    if (assignment.platoonLabel !== currentPlatoon) {
      currentPlatoon = assignment.platoonLabel;
      lines.push(currentPlatoon);
    }

    lines.push(
      `  Slot ${assignment.slotNumber}: ${assignment.playerName} → ${assignment.unitName}`,
    );
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

function CandidateCard({
  title,
  candidate,
  onApplyOne,
  onApplyAll,
  onReplaceOne,
  canApply,
  lookups,
}: {
  title: string;
  candidate: SequentialFullPlatoonPlan['first'] | SequentialFullPlatoonPlan['second'] | null;
  onApplyOne: (action: PlatoonSimulatorAction) => void;
  onApplyAll: (actions: PlatoonSimulatorAction[]) => void;
  onReplaceOne: (
    currentAction: PlatoonSimulatorAction,
    replacement: PlatoonSimulatorAction,
  ) => void;
  canApply: boolean;
  lookups?: Lookups;
}) {
  if (!candidate) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
        <div className="text-sm text-slate-400">{title}</div>
        <h2 className="mt-1 text-2xl font-semibold text-white">No candidate</h2>
        <p className="mt-3 text-sm text-slate-400">
          Kein vollständig machbarer nächster Platoon-Pfad gefunden.
        </p>
      </section>
    );
  }

  const changedAssignmentCount =
    'changedAssignmentCount' in candidate &&
    typeof candidate.changedAssignmentCount === 'number'
      ? candidate.changedAssignmentCount
      : null;

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm text-slate-400">{title}</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">
            {getPlatoonLabel(candidate.targetPlatoonId, lookups?.platoonLabels)}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onApplyAll(candidate.actions)}
          disabled={!canApply || candidate.actions.length === 0}
          className="rounded-2xl border border-indigo-700/70 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply all
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
          <div className="text-xs text-slate-400">Suggested actions</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {candidate.actions.length}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
          <div className="text-xs text-slate-400">Delta full platoons</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {candidate.deltaFullPlatoons}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
          <div className="text-xs text-slate-400">Delta covered slots</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {candidate.deltaCoveredSlots}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
          <div className="text-xs text-slate-400">Changed assignments</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {changedAssignmentCount ?? '—'}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
          <div className="text-xs text-slate-400">Target covered</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {candidate.targetCoveredSlotsBefore} → {candidate.targetCoveredSlotsAfter}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
          <div className="text-xs text-slate-400">Target missing</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {candidate.targetMissingSlotsBefore} → {candidate.targetMissingSlotsAfter}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
          <div className="text-xs text-slate-400">Target becomes full</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {candidate.targetBecomesFull ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Suggested real actions
        </div>

        {candidate.actions.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-black/20 p-4 text-sm text-slate-400">
            Keine Aktionen vorgeschlagen.
          </div>
        ) : (
          <div className="space-y-3">
            {candidate.actions.map((action) => (
              <div
                key={getActionKey(action)}
                className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">
                      {describeAction(action, lookups)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {getActionTypeLabel(action)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onApplyOne(action)}
                    disabled={!canApply}
                    className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>

                {'alternatives' in action && action.alternatives && action.alternatives.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Alternatives
                    </div>

                    {action.alternatives.map((alt, index) => {
                      const replacement: PlatoonSimulatorAction =
                        action.type === 'USE_UNUSED_OWNER'
                          ? {
                              ...action,
                              id: `${action.id}::alt::${alt.memberId}::${index}`,
                              memberId: alt.memberId,
                              playerName: alt.playerName,
                              unitBaseId: alt.unitBaseId,
                              unitName: alt.unitName,
                              missingRelicTiers: 0,
                              missingRarity: 0,
                            }
                          : action.type === 'UPGRADE_OWNER_UNIT'
                            ? {
                                ...action,
                                id: `${action.id}::alt::${alt.memberId}::${index}`,
                                memberId: alt.memberId,
                                playerName: alt.playerName,
                                unitBaseId: alt.unitBaseId,
                                unitName: alt.unitName,
                                missingRelicTiers: alt.missingRelicTiers,
                                missingRarity: alt.missingRarity,
                                actionCost: alt.actionCost,
                              }
                            : action;

                      return (
                        <div
                          key={`${action.id}::alt::${alt.memberId}::${index}`}
                          className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="text-xs text-slate-300">
                            {alt.playerName} → {alt.unitName} ({formatAlternativeCost(
                              alt.missingRelicTiers,
                              alt.missingRarity,
                            )})
                          </div>

                          <button
                            type="button"
                            onClick={() => onReplaceOne(action, replacement)}
                            disabled={!canApply}
                            className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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

export default function PublicGuildSimulatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = useState<string>('');
  const [actions, setActions] = useState<PlatoonSimulatorAction[]>([]);
  const [data, setData] = useState<SimulatorApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedActions, setDebouncedActions] = useState<PlatoonSimulatorAction[]>([]);
  const [includedBonusZoneKeys, setIncludedBonusZoneKeys] = useState<string[]>([]);
  const [mode, setMode] = useState<PlannerMode>('manual');
  const [exportPlanState, setExportPlanState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [exportFullState, setExportFullState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    params.then((resolved) => {
      if (!cancelled) {
        setSlug(resolved.slug);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedActions(actions);
    }, 350);

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
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            actions: debouncedActions,
            includedBonusZoneKeys,
            mode,
          }),
          signal: controller.signal,
        });

        const raw = await res.text();

        let parsed: SimulatorApiResponse | ErrorResponse | null = null;

        try {
          parsed = raw
            ? (JSON.parse(raw) as SimulatorApiResponse | ErrorResponse)
            : null;
        } catch {
          throw new Error(
            raw
              ? `Simulator API returned non-JSON response: ${raw.slice(0, 200)}`
              : 'Simulator API returned empty response',
          );
        }

        if (!res.ok) {
          throw new Error(
            parsed && 'error' in parsed
              ? parsed.error
              : 'Simulation request failed',
          );
        }

        if (requestId === requestIdRef.current) {
          setData(parsed as SimulatorApiResponse);
        }
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

        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [slug, debouncedActions, includedBonusZoneKeys, mode]);

  const summary = useMemo(() => data?.simulation.delta ?? null, [data]);
  const firstCandidate = data?.advisory.first ?? null;
  const secondCandidate = data?.advisory.second ?? null;
  const lookups = data?.lookups;
  const bonusZoneOptions = data?.bonusZoneOptions ?? [];
  const fullNewAssignments = data?.fullNewAssignments ?? [];

  const newlyFullLabels = useMemo(() => {
    if (!summary?.becameFullPlatoonIds?.length) {
      return [];
    }

    return summary.becameFullPlatoonIds.map((id) => {
      return lookups?.platoonLabels?.[id] ?? id;
    });
  }, [summary, lookups]);

  function applyOne(action: PlatoonSimulatorAction) {
    setActions((prev) => upsertActionByRequirementId(prev, action));
  }

  function applyAll(nextActions: PlatoonSimulatorAction[]) {
    setActions((prev) => mergeActions(prev, nextActions));
  }

  function removeAction(action: PlatoonSimulatorAction) {
    const keyToRemove = getActionKey(action);
    setActions((prev) => prev.filter((item) => getActionKey(item) !== keyToRemove));
  }

  function replaceAction(
    _currentAction: PlatoonSimulatorAction,
    replacement: PlatoonSimulatorAction,
  ) {
    setActions((prev) => upsertActionByRequirementId(prev, replacement));
  }

  function resetScenario() {
    setActions([]);
  }

  function toggleBonusZone(zoneKey: string) {
    setIncludedBonusZoneKeys((prev) =>
      prev.includes(zoneKey)
        ? prev.filter((item) => item !== zoneKey)
        : [...prev, zoneKey],
    );
  }

  async function exportPlan() {
    const text = buildExportPlanText({
      mode,
      includedBonusZoneKeys,
      bonusZoneOptions,
      lookups,
      activeActions: actions,
      firstCandidate,
      secondCandidate,
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
    const text = buildExportFullNewAssignmentText({
      mode,
      includedBonusZoneKeys,
      bonusZoneOptions,
      assignments: fullNewAssignments,
    });

    try {
      await copyOrDownloadText(text, 'swgoh-tb-full-new-assignment.txt');
      setExportFullState('copied');
    } catch {
      setExportFullState('failed');
    } finally {
      window.setTimeout(() => setExportFullState('idle'), 2000);
    }
  }

  return (
    <main className="min-h-screen bg-black text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-slate-400">Public guild simulator</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
              Next Full Platoon Simulator
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">
              Manual mode für konkrete Entscheidungen je Slot. Auto mode ist vorbereitet,
              aber noch nicht aktiv.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#020817] p-1">
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`rounded-xl px-4 py-2 text-sm transition ${
                  mode === 'manual'
                    ? 'bg-indigo-500/20 text-indigo-200'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                Manual mode
              </button>

              <button
                type="button"
                disabled
                className="rounded-xl px-4 py-2 text-sm text-slate-500 opacity-60"
                title="Coming soon"
              >
                Auto mode
              </button>
            </div>

            <button
              type="button"
              onClick={exportPlan}
              className="rounded-2xl border border-emerald-700/70 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-200 transition hover:bg-emerald-500/20"
            >
              {exportPlanState === 'copied'
                ? 'Plan exported'
                : exportPlanState === 'failed'
                  ? 'Plan export failed'
                  : 'Export Plan'}
            </button>

            <button
              type="button"
              onClick={exportFullNewAssignment}
              className="rounded-2xl border border-cyan-700/70 bg-cyan-500/10 px-5 py-3 text-sm text-cyan-200 transition hover:bg-cyan-500/20"
            >
              {exportFullState === 'copied'
                ? 'Assignment exported'
                : exportFullState === 'failed'
                  ? 'Assignment export failed'
                  : 'Export Full New Assignment'}
            </button>

            <button
              type="button"
              onClick={resetScenario}
              disabled={actions.length === 0}
              className="rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset scenario
            </button>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-sm text-slate-400">Bonus zones</div>
          <div className="mt-4 flex flex-wrap gap-3">
            {bonusZoneOptions.length === 0 ? (
              <div className="text-sm text-slate-500">No bonus zones available.</div>
            ) : (
              bonusZoneOptions.map((zone) => {
                const checked = includedBonusZoneKeys.includes(zone.zoneKey);

                return (
                  <label
                    key={zone.zoneKey}
                    className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-black/20 px-4 py-3 text-sm text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBonusZone(zone.zoneKey)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span>{zone.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {error ? (
          <div className="mb-8 rounded-3xl border border-rose-900/60 bg-rose-950/30 p-5 text-sm text-rose-200">
            Simulator API failed: {error}
          </div>
        ) : null}

        <div className="mb-8 grid gap-4 md:grid-cols-5">
          <div className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
            <div className="text-sm text-slate-400">Covered slots</div>
            <div className="mt-3 text-5xl font-semibold tracking-tight text-white">
              {summary ? summary.simulatedCoveredSlots : '—'}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {summary
                ? `${summary.baselineCoveredSlots} → ${summary.simulatedCoveredSlots}`
                : loading
                  ? 'Loading…'
                  : 'No data'}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
            <div className="text-sm text-slate-400">Full platoons</div>
            <div className="mt-3 text-5xl font-semibold tracking-tight text-white">
              {summary ? summary.simulatedFullPlatoons : '—'}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {summary
                ? `${summary.baselineFullPlatoons} → ${summary.simulatedFullPlatoons}`
                : loading
                  ? 'Loading…'
                  : 'No data'}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
            <div className="text-sm text-slate-400">Full zones</div>
            <div className="mt-3 text-5xl font-semibold tracking-tight text-white">
              {summary ? summary.simulatedFullZones : '—'}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {summary
                ? `${summary.baselineFullZones} → ${summary.simulatedFullZones}`
                : loading
                  ? 'Loading…'
                  : 'No data'}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
            <div className="text-sm text-slate-400">Changed assignments</div>
            <div className="mt-3 text-5xl font-semibold tracking-tight text-white">
              {summary ? summary.changedAssignmentCount : '—'}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              Scenario assignment movement
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
            <div className="text-sm text-slate-400">Newly full</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {newlyFullLabels.length ? newlyFullLabels.length : '0'}
            </div>
            <div className="mt-2 break-words text-sm text-slate-500">
              {newlyFullLabels.length
                ? newlyFullLabels.join(', ')
                : 'No newly completed platoons'}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Active scenario</h2>
                <div className="mt-1 text-sm text-slate-400">
                  Actions currently applied
                </div>
              </div>

              <div
                className={`text-xs font-medium ${
                  loading
                    ? 'animate-pulse text-rose-400'
                    : 'text-slate-500'
                }`}
              >
                {loading ? 'Recalculating…' : 'Auto-updated'}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-black/20 p-4">
              <div className="text-sm text-slate-400">Applied actions</div>
              <div className="mt-2 text-4xl font-semibold text-white">{actions.length}</div>
            </div>

            <div className="mt-5 space-y-3">
              {actions.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-black/20 p-4 text-sm text-slate-400">
                  Noch keine Aktionen aktiv. Nutze rechts die Advisor-Vorschläge.
                </div>
              ) : (
                actions.map((action) => (
                  <div
                    key={getActionKey(action)}
                    className="rounded-2xl border border-slate-800 bg-black/20 p-4"
                  >
                    <div className="text-sm font-medium text-slate-100">
                      {describeAction(action, lookups)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {getActionTypeLabel(action)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeAction(action)}
                      className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-black/20 p-4">
              <div className="text-sm text-slate-400">Scenario effect</div>

              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Delta covered slots</span>
                  <span>{data?.simulation.delta.deltaCoveredSlots ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Delta full platoons</span>
                  <span>{data?.simulation.delta.deltaFullPlatoons ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Delta full zones</span>
                  <span>{data?.simulation.delta.deltaFullZones ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Displaced assignments</span>
                  <span>{data?.simulation.delta.displacedAssignmentCount ?? '—'}</span>
                </div>
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <CandidateCard
              title="Current next full platoon"
              candidate={firstCandidate}
              onApplyOne={applyOne}
              onApplyAll={applyAll}
              onReplaceOne={replaceAction}
              canApply={!loading}
              lookups={lookups}
            />

            <CandidateCard
              title="Second next full platoon"
              candidate={secondCandidate}
              onApplyOne={applyOne}
              onApplyAll={applyAll}
              onReplaceOne={replaceAction}
              canApply={!loading}
              lookups={lookups}
            />
          </section>
        </div>
      </div>
    </main>
  );
}