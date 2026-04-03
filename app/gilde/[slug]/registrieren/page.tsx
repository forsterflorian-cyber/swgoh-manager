import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@vercel/postgres';

import { Navbar } from '@/components/layout/Navbar';
import { RegistrierungForm } from '@/components/guild/registrierung-form';

export const runtime = 'nodejs';

export default async function RegistrierungPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const result = await sql<{ id: string; name: string }>`
    SELECT id, name FROM guilds WHERE slug = ${slug} LIMIT 1
  `;

  if (result.rows.length === 0) {
    notFound();
  }

  const guild = result.rows[0];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <header className="border-b border-gray-800 bg-gradient-to-b from-blue-950/30 via-gray-950 to-gray-950">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Link
            href={`/gilde/${slug}`}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400 hover:text-blue-300"
          >
            {guild.name}
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Member registration</h1>
          <p className="mt-3 text-sm text-gray-400">
            Link your Discord account to your SWGOH player profile in this guild.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <RegistrierungForm
          guildId={guild.id}
          guildName={guild.name}
          guildSlug={slug}
        />
      </main>
    </div>
  );
}
