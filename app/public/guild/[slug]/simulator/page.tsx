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

type ErrorResponse = {
  error: string;
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
      <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
        <div className="text-sm text-slate-400">{title}</div>
        <h2 className="mt-1 text-2xl font-semibold text-white">No candidate</h2>
        <p className="mt-3 text-sm text-slate-400">
          Kein vollständiges Platoon mit den aktuell modellierten hypothetischen Aktionen gefunden.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#020817] p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm text-slate-400">{title}</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">
            {getPlatoonLabel(candidate.targetPlatoonId)}
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
            {candidate.changedAssignmentCount}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Suggested hypothetical actions
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
                className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-black/20 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-100">
                    {describeAction(action)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{action.type}</div>
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
  const requestIdRef = useRef(0);

  useEffect(() => {
    params.then((resolved) => setSlug(resolved.slug));
  }, [params]);

useEffect(() => {
  if (!slug) return;

  const requestId = ++requestIdRef.current;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  async function run() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/guild/${slug}/simulator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actions }),
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
}, [slug, actions]);
  const summary = useMemo(() => data?.simulation.delta ?? null, [data]);
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
    <main className="min-h-screen bg-black text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-slate-400">Public guild simulator</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
              Next Full Platoon Simulator
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">
              Advisor-zentrierte Simulation. Aktionen werden aus den vorgeschlagenen
              Kandidaten übernommen. Es werden keine Änderungen gespeichert.
            </p>
          </div>

          <button
            type="button"
            onClick={resetScenario}
            disabled={actions.length === 0}
            className="rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset scenario
          </button>
        </div>

        {error ? (
          <div className="mb-8 rounded-3xl border border-rose-900/60 bg-rose-950/30 p-5 text-sm text-rose-200">
            Simulator API failed: {error}
          </div>
        ) : null}

        <div className="mb-8 grid gap-4 md:grid-cols-4">
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
              {summary?.becameFullPlatoonIds?.length
                ? summary.becameFullPlatoonIds.length
                : '0'}
            </div>
            <div className="mt-2 break-words text-sm text-slate-500">
              {summary?.becameFullPlatoonIds?.length
                ? summary.becameFullPlatoonIds.join(', ')
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
                  Hypothetical actions currently applied
                </div>
              </div>

              <div className="text-xs text-slate-500">
                {loading ? 'Recalculating…' : 'Auto-updated'}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-black/20 p-4">
              <div className="text-sm text-slate-400">Applied hypothetical actions</div>
              <div className="mt-2 text-4xl font-semibold text-white">{actions.length}</div>
            </div>

            <div className="mt-5 space-y-3">
              {actions.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-black/20 p-4 text-sm text-slate-400">
                  Noch keine hypothetischen Aktionen aktiv. Nutze rechts die Advisor-Vorschläge.
                </div>
              ) : (
                actions.map((action) => (
                  <div
                    key={getActionKey(action)}
                    className="rounded-2xl border border-slate-800 bg-black/20 p-4"
                  >
                    <div className="text-sm font-medium text-slate-100">
                      {describeAction(action)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{action.type}</div>

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
              canApply={!loading}
            />

            <CandidateCard
              title="Second next full platoon"
              candidate={secondCandidate}
              onApplyOne={applyOne}
              onApplyAll={applyAll}
              canApply={!loading}
            />
          </section>
        </div>
      </div>
    </main>
  );
}