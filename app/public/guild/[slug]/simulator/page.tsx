'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorResponse,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';

type SimulatorApiResponse = {
  simulation: PlatoonSimulatorResponse;
  advisory: SequentialFullPlatoonPlan;
};

function getActionKey(action: PlatoonSimulatorAction): string {
  if (action.type === 'MAKE_SLOT_ELIGIBLE') {
    return `${action.type}::${action.slotKey}::${action.memberId}`;
  }

  return `${action.type}::${action.memberId}::${action.unitBaseId}::${action.planetCategory ?? 'null'}::${action.blockType}`;
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

function getPlatoonLabel(targetPlatoonId: string | null | undefined): string {
  if (!targetPlatoonId) return '—';

  const parts = targetPlatoonId.split('::');
  if (parts.length < 3) return targetPlatoonId;

  const [phase, zoneKey, platoonKey] = parts;
  return `Phase ${phase} · ${zoneKey} · ${platoonKey}`;
}

function describeAction(action: PlatoonSimulatorAction): string {
  if (action.type === 'MAKE_SLOT_ELIGIBLE') {
    return `${action.memberId} → ${action.slotKey} (${action.reason})`;
  }

  return `${action.memberId} → ${action.unitBaseId} (${action.blockType}${action.planetCategory ? ` · ${action.planetCategory}` : ''})`;
}

function CandidateCard({
  title,
  candidate,
  onApplyOne,
  onApplyAll,
  canApply,
}: {
  title: string;
  candidate: SequentialFullPlatoonPlan['first'] | SequentialFullPlatoonPlan['second'] | null;
  onApplyOne: (action: PlatoonSimulatorAction) => void;
  onApplyAll: (actions: PlatoonSimulatorAction[]) => void;
  canApply: boolean;
}) {
  if (!candidate) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 text-sm text-slate-400">
          Kein vollständiges Platoon mit den aktuell modellierten hypothetischen Aktionen gefunden.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-1 text-sm text-slate-300">
            {getPlatoonLabel(candidate.targetPlatoonId)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onApplyAll(candidate.actions)}
          disabled={!canApply || candidate.actions.length === 0}
          className="rounded-lg border border-indigo-700 bg-indigo-900/40 px-3 py-2 text-sm hover:bg-indigo-900/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply all
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Suggested Actions</div>
          <div className="mt-2 text-xl font-semibold">{candidate.actions.length}</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Delta Full Platoons</div>
          <div className="mt-2 text-xl font-semibold">{candidate.deltaFullPlatoons}</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Delta Covered Slots</div>
          <div className="mt-2 text-xl font-semibold">{candidate.deltaCoveredSlots}</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Changed Assignments</div>
          <div className="mt-2 text-xl font-semibold">{candidate.changedAssignmentCount}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Suggested hypothetical actions
        </div>

        {candidate.actions.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400">
            Keine Aktionen vorgeschlagen.
          </div>
        ) : (
          <div className="space-y-2">
            {candidate.actions.map((action) => (
              <div
                key={getActionKey(action)}
                className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {describeAction(action)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{action.type}</div>
                </div>

                <button
                  type="button"
                  onClick={() => onApplyOne(action)}
                  disabled={!canApply}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
  const requestIdRef = useRef(0);

  useEffect(() => {
    params.then((resolved) => setSlug(resolved.slug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;

    const requestId = ++requestIdRef.current;

    async function run() {
      setLoading(true);

      try {
        const res = await fetch(`/api/public/guild/${slug}/simulator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ actions }),
        });

        if (!res.ok) {
          throw new Error('Simulation request failed');
        }

        const json = (await res.json()) as SimulatorApiResponse;

        if (requestId === requestIdRef.current) {
          setData(json);
        }
      } catch (error) {
        console.error(error);
        if (requestId === requestIdRef.current) {
          setData(null);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    run();
  }, [slug, actions]);

  const summary = useMemo(() => {
    return data?.simulation.delta ?? null;
  }, [data]);

  const firstCandidate = data?.advisory.first ?? null;
  const secondCandidate = data?.advisory.second ?? null;

  function applyOne(action: PlatoonSimulatorAction) {
    setActions((prev) => dedupeActions([...prev, action]));
  }

  function applyAll(nextActions: PlatoonSimulatorAction[]) {
    setActions((prev) => dedupeActions([...prev, ...nextActions]));
  }

  function removeAction(action: PlatoonSimulatorAction) {
    const keyToRemove = getActionKey(action);
    setActions((prev) => prev.filter((item) => getActionKey(item) !== keyToRemove));
  }

  function resetScenario() {
    setActions([]);
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Next Full Platoon Simulator</h1>
          <p className="mt-1 text-sm text-slate-400">
            Advisor-zentrierte Simulation. Keine Änderungen werden gespeichert.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetScenario}
            disabled={actions.length === 0}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset scenario
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Covered Slots</div>
          <div className="mt-2 text-xl font-semibold">
            {summary
              ? `${summary.baselineCoveredSlots} → ${summary.simulatedCoveredSlots}`
              : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Full Platoons</div>
          <div className="mt-2 text-xl font-semibold">
            {summary
              ? `${summary.baselineFullPlatoons} → ${summary.simulatedFullPlatoons}`
              : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Changed Assignments</div>
          <div className="mt-2 text-xl font-semibold">
            {summary ? summary.changedAssignmentCount : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Newly Full</div>
          <div className="mt-2 text-sm font-semibold">
            {summary?.becameFullPlatoonIds?.length
              ? summary.becameFullPlatoonIds.join(', ')
              : '—'}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Active Scenario</h2>
            {loading ? (
              <span className="text-xs text-slate-400">Recalculating…</span>
            ) : (
              <span className="text-xs text-slate-500">Auto-updated</span>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs text-slate-400">Applied hypothetical actions</div>
            <div className="mt-2 text-2xl font-semibold">{actions.length}</div>
          </div>

          <div className="mt-4 space-y-3">
            {actions.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400">
                Noch keine hypothetischen Aktionen aktiv. Nutze rechts die Advisor-Vorschläge.
              </div>
            ) : (
              actions.map((action) => (
                <div
                  key={getActionKey(action)}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-3"
                >
                  <div className="text-sm font-medium">{describeAction(action)}</div>
                  <div className="mt-1 text-xs text-slate-400">{action.type}</div>

                  <button
                    type="button"
                    onClick={() => removeAction(action)}
                    className="mt-3 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          {data?.simulation ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs text-slate-400">Scenario effect</div>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Delta covered slots</span>
                  <span>{data.simulation.delta.deltaCoveredSlots}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Delta full platoons</span>
                  <span>{data.simulation.delta.deltaFullPlatoons}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Displaced assignments</span>
                  <span>{data.simulation.delta.displacedAssignmentCount}</span>
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="space-y-6">
          <CandidateCard
            title="Current Next Full Platoon"
            candidate={firstCandidate}
            onApplyOne={applyOne}
            onApplyAll={applyAll}
            canApply={!loading}
          />

          <CandidateCard
            title="Second Next Full Platoon"
            candidate={secondCandidate}
            onApplyOne={applyOne}
            onApplyAll={applyAll}
            canApply={!loading}
          />
        </section>
      </div>
    </main>
  );
}