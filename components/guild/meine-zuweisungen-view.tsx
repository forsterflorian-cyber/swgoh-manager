'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { Button } from '@/components/ui/Button';
import { WorkspaceMetric, WorkspacePanel } from '@/components/workspace/WorkspacePanel';
import { routes } from '@/lib/utils/routes';
import type { ApiEnvelope } from '@/lib/types/api';

type PlatoonAssignment = {
  phase: number;
  zoneName: string;
  platoonNumber: number;
  slotNumber: number;
  unitName: string | null;
  unitBaseId: string;
  currentRelicTier: number | null;
};

type UpgradeRecommendation = {
  unitBaseId: string;
  unitName: string;
  currentRelic: number;
  recommendedRelic: number;
  slotsUnlocked: number;
  priority: 'top' | 'good' | 'longterm';
  affectedPhases: { phase: number; category: string; slotsAdded: number }[];
};

type MyAssignmentsData = {
  playerName: string | null;
  guildName: string;
  guildSlug: string;
  hasRosterData: boolean;
  platoonAssignments: PlatoonAssignment[];
  upgradeAdvisory: UpgradeRecommendation[];
};

type Props = {
  guildId: string;
  guildName: string;
  guildSlug: string;
};

function RelicBadge({ tier }: { tier: number | null }) {
  if (tier == null) return <span className="text-xs text-slate-500">No relic data</span>;
  return (
    <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
      R{tier}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: 'top' | 'good' | 'longterm' }) {
  const styles = {
    top: 'border-amber-700 bg-amber-950/40 text-amber-300',
    good: 'border-blue-800 bg-blue-950/40 text-blue-300',
    longterm: 'border-slate-700 bg-slate-900/70 text-slate-400',
  };
  const labels = { top: 'Top priority', good: 'Good target', longterm: 'Long-term' };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[priority]}`}>
      {labels[priority]}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ZoneBox({ zoneName, assignments }: { zoneName: string; assignments: PlatoonAssignment[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronIcon open={open} />
        <span className="text-sm font-medium text-slate-200">{zoneName}</span>
        <span className="ml-auto text-xs text-slate-500">{assignments.length} slot{assignments.length !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800">
          <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4 border-b border-slate-800/60 bg-slate-950/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            <div>Unit</div>
            <div>Placement</div>
            <div>Roster</div>
          </div>
          <div className="divide-y divide-slate-800/60">
            {assignments.map((assignment) => (
              <div
                key={`${assignment.phase}-${assignment.zoneName}-${assignment.platoonNumber}-${assignment.slotNumber}-${assignment.unitBaseId}`}
                className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{assignment.unitName ?? assignment.unitBaseId}</p>
                </div>
                <div className="min-w-0 text-sm text-slate-400">
                  Platoon {assignment.platoonNumber} · Slot {assignment.slotNumber}
                </div>
                <div className="flex items-center">
                  <RelicBadge tier={assignment.currentRelicTier} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseBox({ phase, assignments }: { phase: number; assignments: PlatoonAssignment[] }) {
  const [open, setOpen] = useState(true);

  const zones = Array.from(new Set(assignments.map((a) => a.zoneName)));
  const byZone = Object.fromEntries(zones.map((z) => [z, assignments.filter((a) => a.zoneName === z)]));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-slate-900/90 px-5 py-4 text-left"
      >
        <ChevronIcon open={open} />
        <span className="text-sm font-semibold text-white">Phase {phase}</span>
        <span className="ml-auto text-xs text-slate-500">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="space-y-3 p-3">
          {zones.map((zone) => (
            <ZoneBox key={zone} zoneName={zone} assignments={byZone[zone]} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdvisoryCard({ rec }: { rec: UpgradeRecommendation }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{rec.unitName}</p>
          <p className="mt-1 text-xs text-slate-500">
            R{rec.currentRelic} → R{rec.recommendedRelic}
          </p>
        </div>
        <PriorityBadge priority={rec.priority} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">
          +{rec.slotsUnlocked} slot{rec.slotsUnlocked !== 1 ? 's' : ''} unlocked
        </span>
        {rec.affectedPhases.map((phase, index) => (
          <span key={`${phase.phase}-${phase.category}-${index}`} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">
            P{phase.phase} {phase.category} +{phase.slotsAdded}
          </span>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-end justify-between pb-3 text-left">
        <div className="flex items-center gap-2">
          <ChevronIcon open={open} />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
        </div>
        <span className="text-sm text-slate-500">{count} {count === 1 ? 'item' : 'items'}</span>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </section>
  );
}

function EmptyState({ guildSlug }: { guildSlug: string }) {
  return (
    <WorkspacePanel
      title="No assignments published yet"
      description="Nothing is assigned to your account right now and there are no upgrade targets attached to your profile."
    >
      <div className="flex flex-wrap gap-3">
        <Link href={routes.publicMatching(guildSlug)}>
          <Button>Open matching board</Button>
        </Link>
        <Link href={routes.publicSimulator(guildSlug)}>
          <Button variant="secondary">Open planner</Button>
        </Link>
      </div>
    </WorkspacePanel>
  );
}

export function MeineZuweisungenView({ guildId, guildName, guildSlug }: Props) {
  const { status: sessionStatus } = useSession();
  const [data, setData] = useState<MyAssignmentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/guild/${guildId}/my-assignments`);
        const payload = (await res.json()) as ApiEnvelope<MyAssignmentsData>;

        if (!res.ok || !payload.ok) {
          if (res.status === 403) {
            setError('not_registered');
          } else if (res.status === 422) {
            setError('relogin');
          } else {
            setError(!payload.ok ? payload.error : 'Failed to load assignments');
          }
          return;
        }

        setData(payload.data);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [guildId, sessionStatus]);

  if (sessionStatus === 'loading' || loading) {
    return (
      <WorkspacePanel title="Loading assignments" description="Checking your member registration and current published tasks.">
        <div className="text-sm text-slate-400">Loading member workspace…</div>
      </WorkspacePanel>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <WorkspacePanel title="Sign in required" description="Your personal assignment board is only available after sign-in.">
        <div className="flex flex-wrap gap-3">
          <Link href={`/login?callbackUrl=${routes.guildAssignments(guildSlug)}`}>
            <Button>Log in</Button>
          </Link>
          <Link href={routes.publicGuildBoard(guildSlug)}>
            <Button variant="secondary">Back to guild board</Button>
          </Link>
        </div>
      </WorkspacePanel>
    );
  }

  if (error === 'not_registered') {
    return (
      <WorkspacePanel title="Complete member setup first" description="This guild cannot match assignments to your account until your ally code is registered.">
        <div className="flex flex-wrap gap-3">
          <Link href={routes.guildRegistration(guildSlug)}>
            <Button>Register now</Button>
          </Link>
          <Link href={routes.publicMatching(guildSlug)}>
            <Button variant="secondary">Open matching board</Button>
          </Link>
        </div>
      </WorkspacePanel>
    );
  }

  if (error === 'relogin') {
    return (
      <WorkspacePanel title="Discord identity needs refresh" description="Your login session does not expose a usable Discord identity for member mapping." tone="warning">
        <div className="text-sm text-slate-300">Log out and sign in again, then reopen this page.</div>
      </WorkspacePanel>
    );
  }

  if (error) {
    return (
      <WorkspacePanel title="Assignments could not be loaded" description={error} tone="warning">
        <Link href={routes.guildAssignments(guildSlug)}>
          <Button>Reload</Button>
        </Link>
      </WorkspacePanel>
    );
  }

  if (!data) return null;

  const nothingToShow = data.platoonAssignments.length === 0 && data.upgradeAdvisory.length === 0;
  const phases = Array.from(new Set(data.platoonAssignments.map((a) => a.phase))).sort((a, b) => a - b);
  const byPhase = Object.fromEntries(phases.map((p) => [p, data.platoonAssignments.filter((a) => a.phase === p)]));
  const highestPriorityUpgrades = data.upgradeAdvisory.filter((rec) => rec.priority === 'top').length;
  const phaseCount = phases.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <WorkspaceMetric label="Player" value={data.playerName ?? 'Unknown'} detail={guildName} />
        <WorkspaceMetric label="Assignments" value={String(data.platoonAssignments.length)} detail={phaseCount > 0 ? `Across ${phaseCount} phase${phaseCount !== 1 ? 's' : ''}` : 'No current placements'} />
        <WorkspaceMetric label="Upgrades" value={String(data.upgradeAdvisory.length)} detail={highestPriorityUpgrades > 0 ? `${highestPriorityUpgrades} top priority` : 'No urgent upgrade target'} />
        <WorkspaceMetric label="Roster sync" value={data.hasRosterData ? 'Ready' : 'Partial'} detail={data.hasRosterData ? 'Roster data available' : 'Results may be incomplete'} />
      </div>

      {!data.hasRosterData ? (
        <WorkspacePanel title="Roster sync is incomplete" description="Assignments can still load, but relic checks and upgrade guidance may be incomplete until officers sync roster data." tone="warning">
          <div className="text-sm text-slate-300">Use this page as directional guidance until the guild roster refresh is complete.</div>
        </WorkspacePanel>
      ) : null}

      {nothingToShow ? (
        <EmptyState guildSlug={guildSlug} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <WorkspacePanel title="Current platoon work" description="Assignments are grouped by phase and zone so the page reads like a task board, not raw output.">
            {data.platoonAssignments.length > 0 ? (
              <CollapsibleSection title="Platoon assignments" count={data.platoonAssignments.length}>
                {phases.map((phase) => (
                  <PhaseBox key={phase} phase={phase} assignments={byPhase[phase]} />
                ))}
              </CollapsibleSection>
            ) : (
              <div className="text-sm text-slate-400">No personal platoon assignments are published yet.</div>
            )}
          </WorkspacePanel>

          <div className="space-y-6">
            <WorkspacePanel title="Upgrade advisory" description="Targets are ordered for one player and framed as follow-up work, not officer planning controls.">
              {data.upgradeAdvisory.length > 0 ? (
                <CollapsibleSection title="Recommended upgrades" count={data.upgradeAdvisory.length}>
                  {data.upgradeAdvisory.map((rec) => (
                    <AdvisoryCard key={`${rec.unitBaseId}-${rec.recommendedRelic}`} rec={rec} />
                  ))}
                </CollapsibleSection>
              ) : (
                <div className="text-sm text-slate-400">No upgrade targets are attached to your profile right now.</div>
              )}
            </WorkspacePanel>

            <WorkspacePanel title="Next places to check" description="A member should always know where to go next." tone="info">
              <div className="flex flex-col gap-3">
                <Link href={routes.publicMatching(guildSlug)}>
                  <Button fullWidth>Open matching board</Button>
                </Link>
                <Link href={routes.publicSimulator(guildSlug)}>
                  <Button variant="secondary" fullWidth>Open planner</Button>
                </Link>
                <Link href={routes.guildRegistration(guildSlug)}>
                  <Button variant="secondary" fullWidth>Review registration</Button>
                </Link>
              </div>
            </WorkspacePanel>
          </div>
        </div>
      )}
    </div>
  );
}
