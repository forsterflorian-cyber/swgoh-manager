import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppContainer, AppSection, AppShell, MetricTile, SectionHeader } from '@/components/app/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getAppBaseUrl } from '@/lib/utils/base-url';
import { routes } from '@/lib/utils/routes';

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

type PublicGuildResponse = { ok: true; data: PublicGuildData } | { ok: false; error: string };

function extractPhaseNumber(value: string) {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const baseUrl = getAppBaseUrl();
  const res = await fetch(`${baseUrl}/api/public/guild/${slug}`, { next: { revalidate: 60 } });
  if (!res.ok) return { title: 'Guild not found' };
  const payload = (await res.json()) as PublicGuildResponse;
  if (!payload.ok) return { title: 'Guild not found' };
  return {
    title: `${payload.data.guild.name} - Guild Board`,
    description: `Guild assignments and readiness context for ${payload.data.guild.name}`,
  };
}

export default async function PublicGuildPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const baseUrl = getAppBaseUrl();
  const res = await fetch(`${baseUrl}/api/public/guild/${slug}`, { next: { revalidate: 60 } });
  if (!res.ok) notFound();
  const payload = (await res.json()) as PublicGuildResponse;
  if (!payload.ok) notFound();

  const { guild, activeTB, assignments, members } = payload.data;
  const phaseEntries = Object.entries(assignments).sort(([left], [right]) => extractPhaseNumber(left) - extractPhaseNumber(right));
  const totalAssignments = phaseEntries.reduce((count, [, zones]) => count + Object.values(zones).reduce((zoneTotal, zoneAssignments) => zoneTotal + zoneAssignments.length, 0), 0);
  const assignedMembers = new Set(phaseEntries.flatMap(([, zones]) => Object.values(zones).flatMap((zoneAssignments) => zoneAssignments.map((assignment) => assignment.allyCode)))).size;

  return (
    <AppShell>
      <AppContainer>
        <div className="space-y-6">
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">Public guild board</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight">{guild.name}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">This is the member-facing surface for read-only assignments and current guild visibility. Protected setup and mutation actions stay inside the officer workspace.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge>Slug: {guild.slug}</Badge>
                  <Badge variant={activeTB ? 'info' : 'neutral'}>{activeTB ? `${activeTB.name} · ${formatStatus(activeTB.status)}` : 'No live board'}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={routes.registration(slug)}><Button variant="secondary">Register member</Button></Link>
                <Link href={routes.login(routes.dashboard())}><Button>Officer login</Button></Link>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Live board" value={activeTB ? activeTB.name : 'None'} detail={activeTB ? `${activeTB.totalPhases} phases · ${formatStatus(activeTB.status)}` : 'No published TB board right now'} tone={activeTB ? 'info' : 'neutral'} />
            <MetricTile label="Assignments" value={totalAssignments} detail={totalAssignments > 0 ? 'Published assignment slots' : 'Nothing published yet'} tone={totalAssignments > 0 ? 'success' : 'neutral'} />
            <MetricTile label="Assigned members" value={assignedMembers} detail={assignedMembers > 0 ? 'Members currently placed' : 'No members assigned yet'} tone={assignedMembers > 0 ? 'success' : 'neutral'} />
            <MetricTile label="Guild members" value={members.length} detail={members.length > 0 ? 'Members visible on the board' : 'No member data synced yet'} tone={members.length > 0 ? 'neutral' : 'warning'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <AppSection>
              <SectionHeader eyebrow="Assignment board" title={activeTB ? activeTB.name : 'No live assignment board'} description={activeTB ? 'Assignments are grouped by phase and zone so members can immediately find where they are expected to contribute.' : 'Guild leadership has not published a live board yet.'} />
              {activeTB && phaseEntries.length > 0 ? (
                <div className="mt-6 space-y-5">
                  {phaseEntries.map(([phaseName, zones]) => (
                    <div key={phaseName} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Phase</p>
                          <h2 className="mt-2 text-2xl font-semibold text-white">{phaseName}</h2>
                        </div>
                        <div className="text-sm text-slate-400">{Object.values(zones).reduce((count, zoneAssignments) => count + zoneAssignments.length, 0)} published assignments</div>
                      </div>
                      <div className="mt-4 space-y-4">
                        {Object.entries(zones).map(([zoneName, zoneAssignments]) => (
                          <div key={zoneName} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                            <div className="border-b border-white/10 px-4 py-3">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <h3 className="text-lg font-semibold text-white">{zoneName}</h3>
                                  <p className="mt-1 text-sm text-slate-400">{zoneAssignments.length} assignments</p>
                                </div>
                                <Badge>{zoneAssignments.length} published</Badge>
                              </div>
                            </div>
                            <div className="divide-y divide-white/10">
                              {zoneAssignments.map((assignment, index) => (
                                <div key={`${assignment.allyCode}-${assignment.unitName}-${index}`} className="grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
                                  <div>
                                    <div className="text-sm font-medium text-white">{assignment.playerName}</div>
                                    <div className="mt-1 text-xs text-slate-500">{assignment.allyCode}</div>
                                  </div>
                                  <div>
                                    <div className="text-sm text-slate-200">{assignment.unitName}</div>
                                    <div className="mt-1 text-xs text-slate-500">Platoon {assignment.platoonNumber} · Slot {assignment.slotNumber}</div>
                                  </div>
                                  <div className="text-sm text-slate-300">Required R{assignment.minRelic} · Player R{assignment.playerRelic}</div>
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
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No assignments are published yet.</div>
              )}
            </AppSection>

            <AppSection>
              <SectionHeader eyebrow="Member actions" title="Use the right surface" description="Members should not need the protected officer dashboard for normal participation." />
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">Register your identity</div>
                  <p className="mt-1 text-sm text-slate-400">Link your Discord account to the correct ally code for this guild.</p>
                  <div className="mt-4"><Link href={routes.registration(slug)}><Button fullWidth variant="secondary">Open registration</Button></Link></div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">My assignments</div>
                  <p className="mt-1 text-sm text-slate-400">Go directly to the personal member workspace after registration.</p>
                  <div className="mt-4"><Link href={routes.assignments(slug)}><Button fullWidth variant="secondary">Open personal view</Button></Link></div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">Simulator</div>
                  <p className="mt-1 text-sm text-slate-400">Open the public simulator when you need a planning sandbox or Discord-ready exports.</p>
                  <div className="mt-4"><Link href={routes.simulator(slug)}><Button fullWidth variant="secondary">Open simulator</Button></Link></div>
                </div>
                <div className="rounded-2xl border border-blue-900/60 bg-blue-950/20 p-4">
                  <div className="text-sm font-medium text-white">Officer-only actions</div>
                  <p className="mt-1 text-sm text-slate-400">Guild setup, sync, publishing and live board management remain protected.</p>
                  <div className="mt-4"><Link href={routes.login(routes.dashboard())}><Button fullWidth>Officer login</Button></Link></div>
                </div>
              </div>
            </AppSection>
          </div>
        </div>
      </AppContainer>
    </AppShell>
  );
}
