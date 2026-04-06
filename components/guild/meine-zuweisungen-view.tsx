'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, LogIn, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { UpgradeAdvisoryCard } from '@/components/guild/UpgradeAdvisoryCard';
import type { ApiEnvelope } from '@/lib/types/api';
import type { MyAssignmentsData, PlatoonAssignment, UpgradeRecommendation } from '@/lib/services/my-assignments';
import { routes } from '@/lib/utils/routes';
type Props = {
  guildId: string;
  guildName: string;
  guildSlug: string;
  initialSessionState?: 'authenticated' | 'unauthenticated';
  initialData?: MyAssignmentsData | null;
  initialError?: string | null;
};

function RelicBadge({ tier }: { tier: number | null }) {
  if (tier == null) return <span className="text-xs text-slate-500">—</span>;
  return <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-300">R{tier}</span>;
}

function ExpandIcon({ open }: { open: boolean }) {
  return <span className={`text-slate-500 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}>⌄</span>;
}

function ZoneBox({ zoneName, assignments }: { zoneName: string; assignments: PlatoonAssignment[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ExpandIcon open={open} />
        <span className="text-sm font-medium text-white">{zoneName}</span>
        <span className="ml-auto text-xs text-slate-500">{assignments.length} slots</span>
      </button>
      {open ? (
        <div className="border-t border-white/10">
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.5fr)] gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <div>Unit</div>
            <div>Placement</div>
            <div>Relic</div>
          </div>
          <div className="divide-y divide-white/10">
            {assignments.map((assignment, index) => (
              <div key={`${assignment.unitBaseId}-${index}`} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.5fr)] gap-4 px-4 py-3">
                <div className="text-sm font-medium text-white">{assignment.unitName ?? assignment.unitBaseId}</div>
                <div className="text-sm text-slate-400">Platoon {assignment.platoonNumber} · Slot {assignment.slotNumber}</div>
                <div className="flex items-center"><RelicBadge tier={assignment.currentRelicTier} /></div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PhaseBox({ phase, assignments }: { phase: number; assignments: PlatoonAssignment[] }) {
  const [open, setOpen] = useState(true);
  const zones = Array.from(new Set(assignments.map((assignment) => assignment.zoneName)));
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/70">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-4 text-left">
        <ExpandIcon open={open} />
        <span className="text-base font-semibold text-white">Phase {phase}</span>
        <span className="ml-auto text-xs text-slate-500">{assignments.length} assignments</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-white/10 p-4">
          {zones.map((zone) => (
            <ZoneBox key={zone} zoneName={zone} assignments={assignments.filter((assignment) => assignment.zoneName === zone)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MeineZuweisungenView({
  guildId,
  guildName,
  guildSlug,
  initialSessionState = 'unauthenticated',
  initialData = null,
  initialError = null,
}: Props) {
  const [sessionState, setSessionState] = useState<'authenticated' | 'unauthenticated'>(initialSessionState);
  const [data, setData] = useState<MyAssignmentsData | null>(initialData);
  const [loading, setLoading] = useState(initialSessionState === 'authenticated' && !initialData && !initialError);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    if (initialData || initialError || initialSessionState !== 'authenticated') {
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/guild/${guildId}/my-assignments`, { cache: 'no-store' });
        const payload = (await res.json()) as ApiEnvelope<MyAssignmentsData>;

        if (!res.ok || !payload.ok) {
          if (res.status === 401) setSessionState('unauthenticated');
          else if (res.status === 403) setError('not_registered');
          else if (res.status === 422) setError('relogin');
          else setError(!payload.ok ? payload.error : 'Failed to load assignments');
          return;
        }

        setSessionState('authenticated');
        setData(payload.data);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [guildId, initialData, initialError, initialSessionState]);

  if (loading) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">Loading your workspace…</div>;
  }

  if (sessionState !== 'authenticated') {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-blue-600/10 p-3 text-blue-300"><LogIn className="h-5 w-5" /></div>
          <div>
            <h2 className="text-xl font-semibold">Log in to view your assignments</h2>
            <p className="mt-2 text-sm text-slate-400">This member workspace is tied to your registered Discord identity.</p>
            <div className="mt-5"><Link href={routes.login(routes.assignments(guildSlug))}><Button>Log in with Discord</Button></Link></div>
          </div>
        </div>
      </div>
    );
  }

  if (error === 'not_registered') {
    return (
      <div className="rounded-2xl border border-amber-800 bg-amber-950/20 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-300"><AlertTriangle className="h-5 w-5" /></div>
          <div>
            <h2 className="text-xl font-semibold">You are not registered yet</h2>
            <p className="mt-2 text-sm text-slate-300">Register your ally code first so the app can identify your member record inside {guildName}.</p>
            <div className="mt-5"><Link href={routes.registration(guildSlug)}><Button rightIcon={<ArrowRight className="h-4 w-4" />}>Register now</Button></Link></div>
          </div>
        </div>
      </div>
    );
  }

  if (error === 'relogin') {
    return <div className="rounded-2xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">Discord identity not linked. Log out and sign in again.</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>;
  }

  if (!data) return null;

  const nothingToShow = data.platoonAssignments.length === 0 && data.upgradeAdvisory.length === 0;
  const phases = Array.from(new Set(data.platoonAssignments.map((assignment) => assignment.phase))).sort((a, b) => a - b);
  const byPhase = Object.fromEntries(phases.map((phase) => [phase, data.platoonAssignments.filter((assignment) => assignment.phase === phase)]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Member identity</p>
          <h2 className="mt-3 text-xl font-semibold text-white">{data.playerName ?? 'Unknown player'}</h2>
          <p className="mt-1 text-sm text-slate-400">{guildName}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">{data.platoonAssignments.length} assignments</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">{data.upgradeAdvisory.length} upgrade hints</span>
          </div>
          {!data.hasRosterData ? <p className="mt-4 text-sm text-amber-300">Roster data has not been synced yet. Assignment and upgrade guidance may be incomplete.</p> : null}
        </div>

        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300"><CheckCircle2 className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">What this page is for</p>
              <h2 className="mt-3 text-xl font-semibold">One place for your current contribution</h2>
              <p className="mt-2 text-sm text-slate-300">Open this page during TB when you want your own assignments, not the whole guild planner.</p>
            </div>
          </div>
        </div>
      </div>

      {nothingToShow ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <div className="mx-auto inline-flex rounded-2xl bg-blue-600/10 p-3 text-blue-300"><Sparkles className="h-6 w-6" /></div>
          <h2 className="mt-4 text-xl font-semibold">Nothing is assigned yet</h2>
          <p className="mt-2 text-sm text-slate-400">No platoon slots matched to you and no upgrade targets are currently flagged.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Assignments</p>
                <h2 className="mt-2 text-xl font-semibold">Your platoon work</h2>
              </div>
            </div>
            <div className="space-y-4">
              {data.platoonAssignments.length > 0 ? phases.map((phase) => <PhaseBox key={phase} phase={phase} assignments={byPhase[phase]} />) : <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No personal platoon assignments right now.</div>}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Upgrade advisory</p>
              <h2 className="mt-2 text-xl font-semibold">Targets worth considering</h2>
            </div>
            <div className="space-y-3">
              {data.upgradeAdvisory.length > 0 ? data.upgradeAdvisory.map((rec, index) => <UpgradeAdvisoryCard key={`${rec.unitBaseId}-${index}`} unitName={rec.unitName} currentRelic={rec.currentRelic} recommendedRelic={rec.recommendedRelic} priority={rec.priority} slotsUnlocked={rec.slotsUnlocked} affectedPhases={rec.affectedPhases} estimatedCost={rec.estimatedCost} impactScore={rec.impactScore} />) : <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No upgrade targets are currently recommended.</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
