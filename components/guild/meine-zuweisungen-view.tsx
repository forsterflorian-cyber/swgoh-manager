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

type UpgradePath = {
  unitBaseId: string;
  unitName: string;
  planetCategory: string | null;
  note: string | null;
  currentRelicTier: number | null;
};

type MyAssignmentsData = {
  playerName: string | null;
  guildName: string;
  guildSlug: string;
  hasRosterData: boolean;
  platoonAssignments: PlatoonAssignment[];
  upgradePaths: UpgradePath[];
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

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{title}</p>
      </div>
      <span className="text-sm text-gray-500">{count} {count === 1 ? 'item' : 'items'}</span>
    </div>
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

  const nothingToShow = data.platoonAssignments.length === 0 && data.upgradePaths.length === 0;

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
            Guild leadership has not assigned any platoon slots or upgrade targets to you yet.
          </p>
        </div>
      ) : (
        <>
          {/* Part A: Platoon matching assignments */}
          {data.platoonAssignments.length > 0 && (
            <section>
              <SectionHeader title="Platoon assignments" count={data.platoonAssignments.length} />
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
                <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,0.6fr)] gap-4 border-b border-gray-800 bg-gray-950/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  <div>Unit</div>
                  <div>Zone / Platoon</div>
                  <div>Relic</div>
                </div>
                <div className="divide-y divide-gray-800">
                  {data.platoonAssignments.map((a, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,0.6fr)] gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{a.unitName ?? a.unitBaseId}</p>
                        <p className="mt-0.5 text-xs text-gray-500">Phase {a.phase} · Slot {a.slotNumber}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-300">{a.zoneName}</p>
                        <p className="mt-0.5 text-xs text-gray-500">Platoon {a.platoonNumber}</p>
                      </div>
                      <div className="flex items-center">
                        <RelicBadge tier={a.currentRelicTier} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Part B: Upgrade paths */}
          {data.upgradePaths.length > 0 && (
            <section>
              <SectionHeader title="Upgrade targets" count={data.upgradePaths.length} />
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
                <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.6fr)] gap-4 border-b border-gray-800 bg-gray-950/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  <div>Unit</div>
                  <div>Category</div>
                  <div>Relic</div>
                </div>
                <div className="divide-y divide-gray-800">
                  {data.upgradePaths.map((u, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.6fr)] gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{u.unitName}</p>
                        {u.note && (
                          <p className="mt-0.5 truncate text-xs text-gray-500">{u.note}</p>
                        )}
                      </div>
                      <div className="text-sm text-gray-400">
                        {u.planetCategory ?? '—'}
                      </div>
                      <div className="flex items-center">
                        <RelicBadge tier={u.currentRelicTier} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
