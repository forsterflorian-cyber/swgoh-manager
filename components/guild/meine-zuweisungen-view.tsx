'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

import type { ApiEnvelope } from '@/lib/types/api';

type Assignment = {
  unitName: string | null;
  requiredRelicTier: number | null;
  zoneName: string;
  platoonNumber: number;
  slotNumber: number;
  status: string;
  playerRelicAtAssignment: number;
};

type MyAssignmentsData = {
  assignments: Assignment[];
  playerName: string | null;
  guildName: string;
  guildSlug: string;
  activeTbName: string | null;
};

type Props = {
  guildId: string;
  guildName: string;
  guildSlug: string;
};

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
        <p className="text-sm text-gray-400">
          You are not registered as a member of this guild yet.
        </p>
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

  return (
    <div className="space-y-6">
      {/* Player info */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          Registered as
        </p>
        <p className="mt-2 text-lg font-semibold text-white">
          {data.playerName ?? 'Unknown player'}
        </p>
        <p className="mt-1 text-sm text-gray-400">{guildName}</p>
      </div>

      {/* Active TB + assignments */}
      {!data.activeTbName ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8 text-center">
          <p className="text-lg font-semibold text-white">No active Territory Battle</p>
          <p className="mt-2 text-sm text-gray-400">
            Check back once guild leadership has started a new TB.
          </p>
        </div>
      ) : data.assignments.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            {data.activeTbName}
          </p>
          <p className="mt-3 text-lg font-semibold text-white">No assignments for you yet</p>
          <p className="mt-2 text-sm text-gray-400">
            Guild leadership has not assigned any platoon slots to you in the current TB.
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                {data.activeTbName}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Your assignments ({data.assignments.length})
              </h2>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-gray-800 bg-gray-950/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              <div>Unit</div>
              <div>Zone / Platoon</div>
              <div>Relic</div>
            </div>

            <div className="divide-y divide-gray-800">
              {data.assignments.map((a, i) => {
                const meetsRelic =
                  a.requiredRelicTier == null ||
                  a.playerRelicAtAssignment >= a.requiredRelicTier;

                return (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {a.unitName ?? '—'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">Slot {a.slotNumber}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-300">{a.zoneName}</p>
                      <p className="mt-1 text-xs text-gray-500">Platoon {a.platoonNumber}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {a.requiredRelicTier != null && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            meetsRelic
                              ? 'border-emerald-900 bg-emerald-950/50 text-emerald-200'
                              : 'border-rose-900 bg-rose-950/50 text-rose-200'
                          }`}
                        >
                          R{a.playerRelicAtAssignment} / R{a.requiredRelicTier}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
