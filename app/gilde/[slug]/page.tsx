import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getAppBaseUrl } from '@/lib/utils/base-url';

type PublicAssignment = {
  playerName: string;
  allyCode: string;
  unitName: string;
  minRelic: number;
  playerRelic: number;
  status: string;
  platoonNumber: string | number;
  slotNumber: string | number;
};

type PublicAssignmentsByPhase = Record<string, Record<string, PublicAssignment[]>>;

type PublicMember = {
  player_name: string;
  ally_code: string;
  galactic_power: number | string | null;
  assignment_count: number | string;
};

type PublicGuildData = {
  guild: {
    name: string;
    slug: string;
  };
  activeTB: {
    name: string;
    status: string;
    totalPhases: number;
  } | null;
  assignments: PublicAssignmentsByPhase;
  members: PublicMember[];
};

type PublicGuildResponse =
  | {
      ok: true;
      data: PublicGuildData;
    }
  | {
      ok: false;
      error: string;
    };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const baseUrl = getAppBaseUrl();
  const res = await fetch(`${baseUrl}/api/public/guild/${slug}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return { title: 'Guild not found' };
  }

  const payload = (await res.json()) as PublicGuildResponse;
  if (!payload.ok) {
    return { title: 'Guild not found' };
  }

  return {
    title: `${payload.data.guild.name} - Guild Board`,
    description: `Guild assignments and readiness context for ${payload.data.guild.name}`,
  };
}

export default async function PublicGuildPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const baseUrl = getAppBaseUrl();

  const res = await fetch(`${baseUrl}/api/public/guild/${slug}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    notFound();
  }

  const payload = (await res.json()) as PublicGuildResponse;
  if (!payload.ok) {
    notFound();
  }

  const data = payload.data;
  const { guild, activeTB, assignments, members } = data;
  const phaseEntries = Object.entries(assignments).sort(([left], [right]) => {
    return extractPhaseNumber(left) - extractPhaseNumber(right);
  });
  const totalAssignments = phaseEntries.reduce((count, [, zones]) => {
    return count + Object.values(zones).reduce((zoneTotal, zoneAssignments) => {
      return zoneTotal + zoneAssignments.length;
    }, 0);
  }, 0);
  const assignedMembers = new Set(
    phaseEntries.flatMap(([, zones]) =>
      Object.values(zones).flatMap((zoneAssignments) =>
        zoneAssignments.map((assignment) => assignment.allyCode)
      )
    )
  ).size;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gradient-to-b from-blue-950/40 via-gray-950 to-gray-950">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                Public guild board
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">{guild.name}</h1>
              <p className="mt-3 max-w-2xl text-sm text-gray-400">
                Read-only Territory Battle assignments and member overview for guild operators and
                members.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <StatusPill label={`Slug: ${guild.slug}`} />
              <StatusPill
                label={
                  activeTB
                    ? `${activeTB.name} (${formatStatus(activeTB.status)})`
                    : 'No live assignment board'
                }
                tone={activeTB ? (activeTB.status === 'active' ? 'positive' : 'info') : 'neutral'}
              />
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Live board"
              value={activeTB ? activeTB.name : 'None'}
              detail={
                activeTB
                  ? `${activeTB.totalPhases} phases · ${formatStatus(activeTB.status)}`
                  : 'No live assignment board is published right now'
              }
              tone={activeTB ? 'info' : 'neutral'}
            />
            <SummaryCard
              title="Assignments"
              value={`${totalAssignments}`}
              detail={
                totalAssignments > 0
                  ? 'Published assignments on the current board'
                  : 'No assignments published yet'
              }
              tone={totalAssignments > 0 ? 'positive' : 'neutral'}
            />
            <SummaryCard
              title="Assigned members"
              value={`${assignedMembers}`}
              detail={
                assignedMembers > 0
                  ? 'Members currently placed in platoon slots'
                  : 'No members assigned yet'
              }
              tone={assignedMembers > 0 ? 'positive' : 'neutral'}
            />
            <SummaryCard
              title="Guild members"
              value={`${members.length}`}
              detail={
                members.length > 0
                  ? 'Members available in the public roster view'
                  : 'No guild members have been imported yet'
              }
              tone={members.length > 0 ? 'neutral' : 'warning'}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Assignment board
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {activeTB ? activeTB.name : 'No live assignment board'}
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              {activeTB
                ? 'Assignments below are grouped by phase and zone so members can find their current platoon responsibility quickly.'
                : 'Guild leadership has not published live platoon assignments yet. Strategic readiness planning may still be happening in the protected planner.'}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Member access
            </p>
            <p className="mt-3 text-sm text-gray-400">
              Need to update assignments or manage the planner? Use the protected guild dashboard.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Log in to manage
            </Link>
          </div>
        </section>

        {activeTB && phaseEntries.length > 0 ? (
          <section className="mt-8 space-y-8">
            {phaseEntries.map(([phaseName, zones]) => (
              <div key={phaseName} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                      Phase
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{phaseName}</h2>
                  </div>
                  <p className="text-sm text-gray-400">
                    {Object.values(zones).reduce(
                      (count, zoneAssignments) => count + zoneAssignments.length,
                      0
                    )}{' '}
                    published assignments
                  </p>
                </div>

                <div className="mt-5 grid gap-4">
                  {Object.entries(zones).map(([zoneName, zoneAssignments]) => (
                    <div
                      key={zoneName}
                      className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950/60"
                    >
                      <div className="border-b border-gray-800 bg-gray-900/80 px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-white">{zoneName}</h3>
                            <p className="mt-1 text-sm text-gray-400">
                              {zoneAssignments.length} assignment
                              {zoneAssignments.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          <StatusPill
                            label={`${zoneAssignments.length} published`}
                            tone="neutral"
                          />
                        </div>
                      </div>

                      <div className="divide-y divide-gray-800">
                        {zoneAssignments.map((assignment, index) => {
                          const meetsRelic = assignment.playerRelic >= assignment.minRelic;

                          return (
                            <div
                              key={`${assignment.allyCode}-${assignment.platoonNumber}-${assignment.slotNumber}-${index}`}
                              className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white">
                                  {assignment.playerName}
                                </p>
                                <p className="mt-1 font-mono text-xs text-gray-500">
                                  {assignment.allyCode}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white">
                                  {assignment.unitName}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  Platoon {assignment.platoonNumber}, slot {assignment.slotNumber}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    meetsRelic
                                      ? 'border-emerald-900 bg-emerald-950/50 text-emerald-200'
                                      : 'border-red-900 bg-red-950/50 text-red-200'
                                  }`}
                                >
                                  R{assignment.playerRelic} / R{assignment.minRelic}
                                </span>
                                <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
                                  {formatStatus(assignment.status)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/70 p-8 text-center">
            <h2 className="text-2xl font-semibold text-white">
              {activeTB ? 'No assignments published yet' : 'No live assignment board available'}
            </h2>
            <p className="mt-3 text-sm text-gray-400">
              {activeTB
                ? 'Guild leadership is still preparing assignments for the current Territory Battle.'
                : 'Check back once guild leadership has published live platoon assignments.'}
            </p>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Guild roster
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Members ({members.length})
              </h2>
            </div>
            <p className="text-sm text-gray-400">
              Sorted alphabetically with current assignment counts from the published board.
            </p>
          </div>

          {members.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.7fr)] gap-4 border-b border-gray-800 bg-gray-950/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                <div>Player</div>
                <div>GP</div>
                <div>Assignments</div>
              </div>

              <div className="divide-y divide-gray-800">
                {members.map((member) => (
                  <div
                    key={member.ally_code}
                    className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.7fr)] gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {member.player_name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-gray-500">{member.ally_code}</p>
                    </div>
                    <div className="text-sm text-gray-300">
                      {formatGalacticPower(member.galactic_power)}
                    </div>
                    <div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs ${
                          Number(member.assignment_count) > 0
                            ? 'border-blue-900 bg-blue-950/50 text-blue-200'
                            : 'border-gray-800 bg-gray-950 text-gray-400'
                        }`}
                      >
                        {member.assignment_count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900/70 p-6 text-sm text-gray-400">
              No guild members are available in the public roster view yet.
            </div>
          )}
        </section>
      </main>

      <footer className="mt-12 border-t border-gray-800">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-gray-500">
          <p>SWGOH guild assignment board</p>
          <p className="mt-1">
            Guild leadership can{' '}
            <Link href="/login" className="text-blue-400 hover:underline">
              log in
            </Link>{' '}
            to manage assignments.
          </p>
        </div>
      </footer>
    </div>
  );
}

function extractPhaseNumber(phaseName: string) {
  const match = phaseName.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatGalacticPower(value: number | string | null) {
  if (!value) {
    return '-';
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return '-';
  }

  return `${(numericValue / 1000000).toFixed(1)}M`;
}

function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'info';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-900/80 text-gray-300',
    positive: 'border-emerald-900 bg-emerald-950/50 text-emerald-200',
    warning: 'border-amber-900 bg-amber-950/50 text-amber-200',
    info: 'border-blue-900 bg-blue-950/50 text-blue-200',
  };

  return <span className={`rounded-full border px-3 py-1 ${toneClasses[tone]}`}>{label}</span>;
}

function SummaryCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: 'neutral' | 'positive' | 'warning' | 'info';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-900/70',
    positive: 'border-emerald-900 bg-emerald-950/30',
    warning: 'border-amber-900 bg-amber-950/30',
    info: 'border-blue-900 bg-blue-950/30',
  };

  return (
    <div className={`rounded-2xl border p-5 ${toneClasses[tone]}`}>
      <p className="text-sm text-gray-400">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm text-gray-500">{detail}</p>
    </div>
  );
}
