import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink, ShieldAlert } from 'lucide-react';

import { AppContainer, AppSection, AppShell, MetricTile, SectionHeader } from '@/components/app/AppShell';
import { CopyDiscordButton } from '@/components/guild/copy-discord-button';
import { GuildSettingsForm } from '@/components/guild/guild-settings-form';
import { IgnoreMemberButton } from '@/components/guild/ignore-member-button';
import { Navbar } from '@/components/layout/Navbar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { WorkspaceHeader, WorkspaceTabs } from '@/components/workspace/WorkspacePrimitives';
import { getAuthenticatedUser } from '@/lib/api/auth';
import {
  getGuildMemberList,
  getPrimaryGuildSettingsForUser,
  getRosterSyncStats,
  isGuildManagerRole,
  type GuildMemberRow,
  type RosterSyncStats,
} from '@/lib/services/guild-settings';
import { getAppBaseUrl } from '@/lib/utils/base-url';
import { routes } from '@/lib/utils/routes';

function formatLastSynced(value: string | Date | null) {
  if (!value) return 'Never';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function GuildSettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect(routes.login(routes.guildSettings()));

  const guild = await getPrimaryGuildSettingsForUser(user.id);
  const appBaseUrl = getAppBaseUrl();
  const members: GuildMemberRow[] = guild ? await getGuildMemberList(guild.id) : [];
  const rosterStats: RosterSyncStats | null = guild ? await getRosterSyncStats(guild.id) : null;

  if (!guild) {
    return (
      <AppShell>
        <Navbar />
        <AppContainer>
          <div className="space-y-6">
            <WorkspaceHeader
              eyebrow="Officer workspace"
              title="Set up your guild workspace"
              description="Start with the guild ID and public slug. After that, the rest of the app has a stable identity for sync, public links and member-facing routes."
              badges={<><Badge variant="info">Setup flow</Badge><Badge>Step 1 of 3</Badge></>}
            />

            <WorkspaceTabs
              currentPath={routes.guildSettings()}
              tabs={[
                { href: routes.dashboard(), label: 'Overview', hint: 'Guild status and sync health' },
                { href: routes.guildSettings(), label: 'Guild setup', hint: 'Identity and links' },
              ]}
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <AppSection>
                <SectionHeader eyebrow="Setup" title="Connect the guild" description="Enter the SWGOH guild identifier and choose the slug members will use for registration and personal assignments." />
                <div className="mt-6">
                  <GuildSettingsForm appBaseUrl={appBaseUrl} initialGuildId="" initialSlug="" />
                </div>
              </AppSection>

              <AppSection>
                <SectionHeader eyebrow="What follows" title="What unlocks after this step" />
                <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-1">
                  <MetricTile label="Step 1" value="Connect" detail="Set guild ID and public slug." tone="info" />
                  <MetricTile label="Step 2" value="Sync" detail="Import members and roster data." tone="neutral" />
                  <MetricTile label="Step 3" value="Publish" detail="Share matching and assignments." tone="success" />
                </div>
                <div className="mt-6">
                  <Link href={routes.dashboard()}><Button variant="secondary">Back to dashboard</Button></Link>
                </div>
              </AppSection>
            </div>
          </div>
        </AppContainer>
      </AppShell>
    );
  }

  if (!isGuildManagerRole(guild.role)) {
    return (
      <AppShell>
        <Navbar />
        <AppContainer>
          <AppSection className="max-w-3xl border-rose-900/70 bg-rose-950/20">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-rose-500/10 p-3 text-rose-300"><ShieldAlert className="h-6 w-6" /></div>
              <div>
                <Badge variant="danger">403</Badge>
                <h1 className="mt-3 text-2xl font-semibold">Officer access required</h1>
                <p className="mt-2 text-sm text-slate-300">Only guild owners, admins and officers can change the guild ID, slug and publishable surfaces.</p>
                <div className="mt-5"><Link href={routes.dashboard()}><Button variant="secondary">Back to dashboard</Button></Link></div>
              </div>
            </div>
          </AppSection>
        </AppContainer>
      </AppShell>
    );
  }

  const publicMatchingHref = guild.slug ? `${appBaseUrl}${routes.matching(guild.slug)}` : null;
  const publicSimulatorHref = guild.slug ? `${appBaseUrl}${routes.simulator(guild.slug)}` : null;

  return (
    <AppShell>
      <Navbar />
      <AppContainer>
        <div className="space-y-6">
          <WorkspaceHeader
            eyebrow="Officer workspace"
            title={`Guild setup · ${guild.name}`}
            description="This is the administrative surface. Keep identity, sync and sharing actions here so members do not need to wade through setup controls."
            badges={<><Badge variant="success">Officer access</Badge>{guild.slug ? <Badge>{guild.slug}</Badge> : null}</>}
          />

          <WorkspaceTabs
            currentPath={routes.guildSettings()}
            tabs={[
              { href: routes.dashboard(), label: 'Overview', hint: 'Guild status and sync health' },
              { href: routes.guildSettings(), label: 'Guild setup', hint: 'Identity and publishing' },
              ...(guild.slug ? [{ href: routes.publicGuild(guild.slug), label: 'Guild board', hint: 'Open public view' }] : []),
            ]}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <MetricTile label="Tracked members" value={members.length} detail="Guild members visible in setup" tone="info" />
            <MetricTile label="Roster coverage" value={rosterStats ? `${rosterStats.membersSynced}/${rosterStats.totalMembersEligible}` : '—'} detail="Members with synced roster data" tone="success" />
            <MetricTile label="Last sync" value={rosterStats ? formatLastSynced(rosterStats.lastSyncedAt) : 'Never'} detail="Latest roster refresh" tone="neutral" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <AppSection>
              <SectionHeader eyebrow="Identity" title="Guild configuration" description="Update the external guild ID and public slug used across protected and member-facing surfaces." />
              <div className="mt-6">
                <GuildSettingsForm appBaseUrl={appBaseUrl} initialGuildId={guild.guildId ?? ''} initialSlug={guild.slug} />
              </div>
            </AppSection>

            <AppSection>
              <SectionHeader eyebrow="Sharing" title="Public surfaces" description="These are the links your guild should use; keep setup and mutation inside the officer workspace." />
              <div className="mt-5">
                <CopyDiscordButton guildName={guild.name} matchingUrl={publicMatchingHref} simulatorUrl={publicSimulatorHref} />
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">Matching board</div>
                  <p className="mt-1 text-sm text-slate-400">Read-only guild-wide coverage and gap board.</p>
                  <div className="mt-4">{publicMatchingHref ? <a href={publicMatchingHref} target="_blank" rel="noreferrer"><Button variant="secondary" fullWidth leftIcon={<ExternalLink className="h-4 w-4" />}>Open matching</Button></a> : <div className="text-sm text-slate-500">Set a slug first.</div>}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">Simulator</div>
                  <p className="mt-1 text-sm text-slate-400">Public planning surface for review and exports.</p>
                  <div className="mt-4">{publicSimulatorHref ? <a href={publicSimulatorHref} target="_blank" rel="noreferrer"><Button variant="secondary" fullWidth leftIcon={<ExternalLink className="h-4 w-4" />}>Open simulator</Button></a> : <div className="text-sm text-slate-500">Set a slug first.</div>}</div>
                </div>
              </div>
            </AppSection>
          </div>

          <AppSection>
            <SectionHeader eyebrow="Roster hygiene" title="Member roster scope" description="Ignored members stay out of roster sync and planning noise. Keep this list intentional." />
            {members.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">No members have been imported yet.</div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <div>Member</div>
                  <div>Ally code</div>
                  <div>Action</div>
                </div>
                <div className="divide-y divide-white/10">
                  {members.map((member) => (
                    <div key={member.id} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-4 px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium text-white">{member.playerName}</div>
                        <div className="mt-1 text-xs text-slate-500">{Boolean(member.ignoredAt) ? 'Ignored from sync' : 'Included in sync'}</div>
                      </div>
                      <div className="font-mono text-slate-300">{member.allyCode}</div>
                      <div>
                        <IgnoreMemberButton guildId={guild.id} memberId={member.id} initiallyIgnored={Boolean(member.ignoredAt)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AppSection>
        </div>
      </AppContainer>
    </AppShell>
  );
}
