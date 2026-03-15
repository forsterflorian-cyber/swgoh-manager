'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorResponse,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';

type SimulatorApiResponse = {
  simulation: PlatoonSimulatorResponse;
  advisory: SequentialFullPlatoonPlan;
};

function createActionId() {
  return Math.random().toString(36).slice(2, 10);
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

  useEffect(() => {
    params.then((resolved) => setSlug(resolved.slug));
  }, [params]);

  async function runSimulation(nextActions: PlatoonSimulatorAction[]) {
    if (!slug) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/public/guild/${slug}/simulator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actions: nextActions }),
      });

      if (!res.ok) {
        throw new Error('Simulation request failed');
      }

      const json = (await res.json()) as SimulatorApiResponse;
      setData(json);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!slug) return;
    runSimulation([]);
  }, [slug]);

  const hasResults = !!data?.simulation;

  const summary = useMemo(() => {
    if (!data) return null;
    return data.simulation.delta;
  }, [data]);

function addEligibleAction() {
  const slotKey = window.prompt('slotKey?');
  const memberId = window.prompt('memberId?');
  if (!slotKey || !memberId) return;

  const nextActions: PlatoonSimulatorAction[] = [
    ...actions,
    {
      id: createActionId(),
      type: 'MAKE_SLOT_ELIGIBLE',
      slotKey,
      memberId,
      reason: 'upgrade',
    },
  ];

  setActions(nextActions);
}


function addRemoveBlockAction() {
  const memberId = window.prompt('memberId?');
  const unitBaseId = window.prompt('unitBaseId?');
  const planetCategoryInput = window.prompt('planetCategory? (LS / DS / MIX or empty)');
  if (!memberId || !unitBaseId) return;

  const planetCategory =
    planetCategoryInput === 'LS' || planetCategoryInput === 'DS' || planetCategoryInput === 'MIX'
      ? planetCategoryInput
      : null;

  const nextActions: PlatoonSimulatorAction[] = [
    ...actions,
    {
      id: createActionId(),
      type: 'REMOVE_SOURCE_BLOCK',
      memberId,
      unitBaseId,
      planetCategory,
      blockType: 'committed',
    },
  ];

  setActions(nextActions);
}

  function removeAction(actionId: string) {
    const nextActions = actions.filter((item) => item.id !== actionId);
    setActions(nextActions);
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Simulator</h1>
        <p className="mt-1 text-sm text-slate-400">
          Hypothetical scenario only. No changes are saved.
        </p>
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
          <div className="mt-2 text-xl font-semibold">
            {summary?.becameFullPlatoonIds?.length
              ? summary.becameFullPlatoonIds.join(', ')
              : '—'}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-lg font-semibold">Actions</h2>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={addEligibleAction}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Add MAKE_SLOT_ELIGIBLE
            </button>

            <button
              onClick={addRemoveBlockAction}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Add REMOVE_SOURCE_BLOCK
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {actions.length === 0 ? (
              <div className="text-sm text-slate-400">No hypothetical actions.</div>
            ) : (
              actions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-3"
                >
                  <div className="text-sm font-medium">{action.type}</div>
                  <pre className="mt-2 overflow-x-auto text-xs text-slate-300">
                    {JSON.stringify(action, null, 2)}
                  </pre>
                  <button
                    onClick={() => removeAction(action.id)}
                    className="mt-2 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => runSimulation(actions)}
              disabled={loading}
              className="rounded-lg border border-indigo-700 bg-indigo-900/40 px-3 py-2 text-sm hover:bg-indigo-900/60 disabled:opacity-50"
            >
              {loading ? 'Simulating...' : 'Run simulation'}
            </button>

            <button
              onClick={() => {
                setActions([]);
                runSimulation([]);
              }}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Reset
            </button>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">Simulation result</h2>

            {!hasResults ? (
              <div className="mt-4 text-sm text-slate-400">No result yet.</div>
            ) : (
              <pre className="mt-4 overflow-x-auto text-xs text-slate-300">
                {JSON.stringify(data.simulation, null, 2)}
              </pre>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">Next Full Platoon</h2>
            <pre className="mt-4 overflow-x-auto text-xs text-slate-300">
              {JSON.stringify(data?.advisory?.first ?? null, null, 2)}
            </pre>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">Second Next Full Platoon</h2>
            <pre className="mt-4 overflow-x-auto text-xs text-slate-300">
              {JSON.stringify(data?.advisory?.second ?? null, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}