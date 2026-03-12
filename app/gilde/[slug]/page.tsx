import Link from 'next/link';
import { Metadata } from 'next';
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

  const data = payload.data;
  return {
    title: `${data.guild.name} - TB Assignments`,
    description: `Territory Battle assignments for ${data.guild.name}`,
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gradient-to-b from-blue-900/30 to-gray-950">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <h1 className="text-4xl font-bold">{guild.name}</h1>
          {activeTB ? (
            <div className="mt-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-700 bg-blue-900/50 px-4 py-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    activeTB.status === 'active' ? 'animate-pulse bg-green-400' : 'bg-yellow-400'
                  }`}
                />
                <span className="text-sm">
                  {activeTB.name} - {activeTB.status === 'active' ? 'Active' : 'Planning'}
                </span>
              </span>
            </div>
          ) : (
            <p className="mt-4 text-gray-400">No active Territory Battle</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <PublicSearchBar />

        {activeTB && Object.keys(assignments).length > 0 ? (
          <div className="mt-8 space-y-8">
            {Object.entries(assignments).map(([phaseName, zones]) => (
              <div key={phaseName}>
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-mono">
                    {phaseName.replace('Phase ', '')}
                  </span>
                  {phaseName}
                </h2>

                <div className="grid gap-4">
                  {Object.entries(zones).map(([zoneName, zoneAssignments]) => (
                    <div
                      key={zoneName}
                      className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900"
                    >
                      <div className="border-b border-gray-800 bg-gray-800/50 px-4 py-3">
                        <h3 className="font-semibold">{zoneName}</h3>
                        <p className="text-xs text-gray-400">
                          {zoneAssignments.length} assignments
                        </p>
                      </div>

                      <div className="divide-y divide-gray-800">
                        {zoneAssignments.map((assignment, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-3 items-center gap-4 px-4 py-3 transition-colors hover:bg-gray-800/30 md:grid-cols-4"
                          >
                            <div>
                              <p className="text-sm font-medium">{assignment.playerName}</p>
                              <p className="font-mono text-xs text-gray-500">
                                {assignment.allyCode}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm">{assignment.unitName}</p>
                              <p className="text-xs text-gray-500">
                                Platoon {assignment.platoonNumber}, slot {assignment.slotNumber}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded border px-2 py-0.5 font-mono text-xs ${
                                  assignment.playerRelic >= assignment.minRelic
                                    ? 'border-emerald-700 bg-emerald-900/50 text-emerald-300'
                                    : 'border-red-700 bg-red-900/50 text-red-300'
                                }`}
                              >
                                R{assignment.playerRelic}
                              </span>
                              <span className="text-xs text-gray-500">
                                / R{assignment.minRelic} required
                              </span>
                            </div>
                            <div className="hidden md:block">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  assignment.status === 'confirmed'
                                    ? 'bg-emerald-900/50 text-emerald-300'
                                    : assignment.status === 'completed'
                                      ? 'bg-blue-900/50 text-blue-300'
                                      : 'bg-gray-700 text-gray-300'
                                }`}
                              >
                                {assignment.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-gray-500">
            <p className="text-xl">No assignments published yet</p>
            <p className="mt-2">Guild leadership is still preparing the current TB.</p>
          </div>
        )}

        {members && members.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-2xl font-bold">Members ({members.length})</h2>
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              <div className="grid grid-cols-3 gap-4 bg-gray-800/50 px-4 py-2 text-xs uppercase tracking-wider text-gray-400">
                <div>Player</div>
                <div>GP</div>
                <div>Assignments</div>
              </div>
              {members.map((member) => (
                <div
                  key={member.ally_code}
                  className="grid grid-cols-3 gap-4 border-t border-gray-800 px-4 py-2 hover:bg-gray-800/30"
                >
                  <div>
                    <p className="text-sm font-medium">{member.player_name}</p>
                    <p className="font-mono text-xs text-gray-500">{member.ally_code}</p>
                  </div>
                  <div className="text-sm text-gray-300">
                    {member.galactic_power
                      ? `${(Number(member.galactic_power) / 1000000).toFixed(1)}M`
                      : '-'}
                  </div>
                  <div>
                    <span
                      className={`text-sm ${
                        Number(member.assignment_count) > 0 ? 'text-blue-400' : 'text-gray-500'
                      }`}
                    >
                      {member.assignment_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 border-t border-gray-800">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-gray-500">
          <p>SWGOH TB Manager - public assignment board</p>
          <p className="mt-1">
            Guild leadership?{' '}
            <Link href="/login" className="text-blue-400 hover:underline">
              Log in
            </Link>{' '}
            to manage assignments.
          </p>
        </div>
      </footer>
    </div>
  );
}

function PublicSearchBar() {
  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search player or unit..."
        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
