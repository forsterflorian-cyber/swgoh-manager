import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  getPublicStrategicTargetsBoard,
  type PublicStrategicTarget,
} from '@/lib/services/public-strategic-targets';
import { formatDateTime } from '@/lib/utils/format-date';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const board = await getPublicStrategicTargetsBoard(slug);

  if (!board) {
    return { title: 'Strategic targets not found' };
  }

  return {
    title: `${board.guild.name} - Strategic Targets`,
    description: `Public strategic target board for ${board.guild.name}`,
  };
}

export default async function PublicStrategicTargetsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const board = await getPublicStrategicTargetsBoard(slug);

  if (!board) {
    notFound();
  }

  const targetsByMember = groupTargetsByMember(board.targets);
  const targetsByUnit = groupTargetsByUnit(board.targets);
  const discordCopy = buildDiscordCopy(board.guild.name, targetsByMember);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gradient-to-b from-blue-950/40 via-gray-950 to-gray-950">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                Public strategic targets
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">{board.guild.name}</h1>
              <p className="mt-3 max-w-2xl text-sm text-gray-400">
                Login-free view of the current strategic build targets for Territory Battle platoon
                planning.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>Slug: {board.guild.slug}</Badge>
              <Badge variant={board.lastUpdatedAt ? 'info' : 'neutral'}>
                {board.lastUpdatedAt
                  ? `Updated ${formatDateTime(board.lastUpdatedAt)}`
                  : 'No strategic targets yet'}
              </Badge>
              {board.isFixture && <Badge variant="warning">Fixture mode</Badge>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Copy for Discord
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Plain text block for sharing the latest strategic target list with the guild.
            </p>
            <textarea
              readOnly
              value={discordCopy}
              className="mt-4 min-h-48 w-full rounded-2xl border border-gray-800 bg-gray-950/80 p-4 text-sm text-gray-100 outline-none"
            />
          </Card>

          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Access
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Read-only board</h2>
            <p className="mt-3 text-sm text-gray-400">
              Members can open this page without logging in. Guild leadership still manages targets
              in the protected planner.
            </p>
            <Link href="/login" className="mt-5 inline-block">
              <Button variant="primary">Log in to manage</Button>
            </Link>
          </Card>
        </section>

        <section className="mt-8 grid gap-4 xl:grid-cols-2">
          <BoardSection
            eyebrow="View 1"
            title="By Member"
            emptyMessage="No member targets are published yet."
            groups={targetsByMember}
          />
          <BoardSection
            eyebrow="View 2"
            title="By Unit"
            emptyMessage="No unit targets are published yet."
            groups={targetsByUnit}
          />
        </section>
      </main>
    </div>
  );
}

function groupTargetsByMember(targets: PublicStrategicTarget[]) {
  const groups = new Map<string, PublicStrategicTarget[]>();

  for (const target of targets) {
    const existing = groups.get(target.memberName);
    if (existing) {
      existing.push(target);
      continue;
    }

    groups.set(target.memberName, [target]);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function groupTargetsByUnit(targets: PublicStrategicTarget[]) {
  const groups = new Map<string, PublicStrategicTarget[]>();

  for (const target of targets) {
    const existing = groups.get(target.unitName);
    if (existing) {
      existing.push(target);
      continue;
    }

    groups.set(target.unitName, [target]);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function buildDiscordCopy(
  guildName: string,
  groups: Array<[string, PublicStrategicTarget[]]>
) {
  if (groups.length === 0) {
    return `${guildName} strategic targets\n\nNo strategic targets published yet.`;
  }

  const lines = [`${guildName} strategic targets`, ''];

  for (const [memberName, targets] of groups) {
    lines.push(memberName);

    for (const target of targets) {
      lines.push(`- ${target.unitName}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

function BoardSection({
  eyebrow,
  title,
  emptyMessage,
  groups,
}: {
  eyebrow: string;
  title: string;
  emptyMessage: string;
  groups: Array<[string, PublicStrategicTarget[]]>;
}) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>

      {groups.length > 0 ? (
        <div className="mt-5 space-y-4">
          {groups.map(([label, targets]) => (
            <Card key={label} variant="highlight">
              <h3 className="text-lg font-semibold text-white">{label}</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-200">
                {targets.map((target, index) => (
                  <li
                    key={`${label}-${target.unitName}-${index}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span>- {title === 'By Member' ? target.unitName : target.memberName}</span>
                    {target.planetCategory && (
                      <Badge variant="neutral" size="sm">
                        {target.planetCategory}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="highlight">
          <p className="text-sm text-gray-300">{emptyMessage}</p>
        </Card>
      )}
    </Card>
  );
}
