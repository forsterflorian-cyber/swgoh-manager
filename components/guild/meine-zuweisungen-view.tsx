'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

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
  if (tier == null) return null;
  return (
    <span className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
      R{tier}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: 'top' | 'good' | 'longterm' }) {
  const styles = {
    top: 'border-amber-600 bg-amber-950/50 text-amber-300',
    good: 'border-blue-700 bg-blue-950/50 text-blue-300',
    longterm: 'border-gray-700 bg-gray-800 text-gray-400',
  };
  const labels = { top: 'Top Priority', good: 'Good', longterm: 'Long-term' };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[priority]}`}>
      {labels[priority]}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
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
    <div className="rounded-xl border border-gray-800 bg-gray-900/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <ChevronIcon open={open} />
        <span className="text-sm font-medium text-gray-300">{zoneName}</span>
        <span className="ml-auto text-xs text-gray-600">{assignments.length} slot{assignments.length !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="border-t border-gray-800">
          <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,0.6fr)] gap-4 border-b border-gray-800/60 bg-gray-950/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-gray-600">
            <div>Unit</div>
            <div>Platoon / Slot</div>
            <div>Relic</div>
          </div>
          <div className="divide-y divide-gray-800/60">
            {assignments.map((a, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,0.6fr)] gap-4 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{a.unitName ?? a.unitBaseId}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-400">
                    Platoon {a.platoonNumber} · Slot {a.slotNumber}
                  </p>
                </div>
                <div className="flex items-center">
                  <RelicBadge tier={a.currentRelicTier} />
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
  const byZone = Object.fromEntries(
    zones.map((z) => [z, assignments.filter((a) => a.zoneName === z)]),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-700 bg-gray-900/70">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-gray-800/60 px-5 py-3.5 text-left"
      >
        <ChevronIcon open={open} />
        <span className="text-sm font-semibold text-white">Phase {phase}</span>
        <span className="ml-auto text-xs text-gray-500">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="space-y-2 p-3">
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
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{rec.unitName}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            R{rec.currentRelic} → R{rec.recommendedRelic}
          </p>
        </div>
        <PriorityBadge priority={rec.priority} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
        <span className="rounded-md border border-gray-700 bg-gray-800/60 px-2 py-1">
          +{rec.slotsUnlocked} slot{rec.slotsUnlocked !== 1 ? 's' : ''} unlocked
        </span>
        {rec.affectedPhases.map((p, i) => (
          <span key={i} className="rounded-md border border-gray-700 bg-gray-800/60 px-2 py-1">
            P{p.phase} {p.category} +{p.slotsAdded}
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-end justify-between pb-2"
      >
        <div className="flex items-center gap-2">
          <ChevronIcon open={open} />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{title}</p>
        </div>
        <span className="text-sm text-gray-500">{count} {count === 1 ? 'item' : 'items'}</span>
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </section>
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
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8 text-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8">
        <p className="text-sm text-gray-400">Log in with Discord to view your assignments.</p>
        <Link
          href={`/login?callbackUrl=/gilde/${guildSlug}/meine-zuweisungen`}
          className="mt-5 inline-flex rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Log in with Discord
        </Link>
      </div>
    );
  }

  if (error === 'not_registered') {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8">
        <p className="text-sm text-gray-400">You are not registered as a member of this guild yet.</p>
        <Link
          href={`/gilde/${guildSlug}/registrieren`}
          className="mt-5 inline-flex rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Register now
        </Link>
      </div>
    );
  }

  if (error === 'relogin') {
    return (
      <div className="rounded-2xl border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
        Discord identity not linked. Please log out and log back in.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const nothingToShow = data.platoonAssignments.length === 0 && data.upgradeAdvisory.length === 0;

  // Group platoon assignments by phase
  const phases = Array.from(new Set(data.platoonAssignments.map((a) => a.phase))).sort((a, b) => a - b);
  const byPhase = Object.fromEntries(
    phases.map((p) => [p, data.platoonAssignments.filter((a) => a.phase === p)]),
  );

  return (
    <div className="space-y-8">
      {/* Player info */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Registered as</p>
        <p className="mt-2 text-lg font-semibold text-white">{data.playerName ?? 'Unknown player'}</p>
        <p className="mt-1 text-sm text-gray-400">{guildName}</p>
        {!data.hasRosterData && (
          <p className="mt-3 text-xs text-amber-400">
            Roster not yet synced — assignments may be incomplete.
          </p>
        )}
      </div>

      {nothingToShow ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8 text-center">
          <p className="text-lg font-semibold text-white">No assignments yet</p>
          <p className="mt-2 text-sm text-gray-400">
            No platoon slots matched for you and no upgrade targets found.
          </p>
        </div>
      ) : (
        <>
          {/* Part A: Platoon assignments — grouped by phase → zone */}
          {data.platoonAssignments.length > 0 && (
            <CollapsibleSection title="Platoon assignments" count={data.platoonAssignments.length}>
              <div className="space-y-3">
                {phases.map((phase) => (
                  <PhaseBox key={phase} phase={phase} assignments={byPhase[phase]} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Part B: Upgrade advisory */}
          {data.upgradeAdvisory.length > 0 && (
            <CollapsibleSection title="Upgrade advisory" count={data.upgradeAdvisory.length}>
              {data.upgradeAdvisory.map((rec, i) => (
                <AdvisoryCard key={i} rec={rec} />
              ))}
            </CollapsibleSection>
          )}
        </>
      )}
    </div>
  );
}
