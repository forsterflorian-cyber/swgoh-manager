'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { LogoutButton } from '@/components/auth/logout-button';
import { SessionIndicator } from '@/components/auth/session-indicator';

type NavbarProps = {
  guildName?: string | null;
  guildSlug?: string | null;
  canManageGuild?: boolean;
};

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', match: '/dashboard' },
] as const;

export function Navbar({
  guildName,
  guildSlug,
  canManageGuild = false,
}: NavbarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const displayName = session?.user?.name?.trim() || session?.user?.email?.trim() || null;

  if (status !== 'authenticated' || !displayName) {
    return null;
  }

  const registrationLink = guildSlug
    ? [{ href: `/gilde/${guildSlug}/registrieren`, label: 'Registrierung', match: `/gilde/${guildSlug}/registrieren` }]
    : [];

  const adminLinks = canManageGuild
    ? [{ href: '/settings/guild', label: 'Guild Settings', match: '/settings/guild' }]
    : [];

  const links = [...NAV_LINKS, ...registrationLink, ...adminLinks];

  return (
    <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
          <Link href="/dashboard" className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            SWGOH Manager
          </Link>

          <nav className="flex flex-wrap gap-2">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.match !== link.href && pathname?.startsWith(link.match));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-950/50 text-blue-100'
                      : 'border-gray-800 bg-gray-900/70 text-gray-300 hover:border-gray-700 hover:bg-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
          <SessionIndicator
            displayName={displayName}
            guildName={guildName}
            guildSlug={guildSlug}
          />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
