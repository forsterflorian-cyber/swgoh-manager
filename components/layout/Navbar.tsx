'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { LogoutButton } from '@/components/auth/logout-button';
import type { ApiEnvelope } from '@/lib/types/api';

type NavContext = {
  adminGuild: {
    name: string;
    slug: string;
    canManageGuild: boolean;
  } | null;
  memberGuild: {
    name: string;
    slug: string;
  } | null;
};

type NavLink = { href: string; label: string };

function NavLink({ href, label, pathname }: NavLink & { pathname: string }) {
  const active = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'border-blue-500 bg-blue-950/50 text-blue-100'
          : 'border-gray-800 bg-gray-900/70 text-gray-300 hover:border-gray-700 hover:bg-gray-900'
      }`}
    >
      {label}
    </Link>
  );
}

function NavSection({
  label,
  links,
  pathname,
}: {
  label: string;
  links: NavLink[];
  pathname: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs font-semibold uppercase tracking-widest text-gray-600 lg:inline">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} pathname={pathname} />
        ))}
      </div>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [ctx, setCtx] = useState<NavContext | null>(null);

  const displayName = session?.user?.name?.trim() || session?.user?.email?.trim() || null;

  useEffect(() => {
    if (status !== 'authenticated') return;

    fetch('/api/me/nav-context')
      .then((r) => r.json())
      .then((payload: ApiEnvelope<NavContext>) => {
        if (payload.ok) setCtx(payload.data);
      })
      .catch(() => {/* non-critical */});
  }, [status]);

  if (status !== 'authenticated' || !displayName) {
    return null;
  }

  const adminLinks: NavLink[] = [
    { href: '/dashboard', label: 'Dashboard' },
    ...(ctx?.adminGuild?.canManageGuild
      ? [{ href: '/settings/guild', label: 'Guild Settings' }]
      : []),
  ];

  const memberLinks: NavLink[] = ctx?.memberGuild
    ? [
        { href: `/gilde/${ctx.memberGuild.slug}/registrieren`, label: 'Registration' },
        { href: `/public/guild/${ctx.memberGuild.slug}/matching`, label: 'Matching' },
        { href: `/public/guild/${ctx.memberGuild.slug}/simulator`, label: 'Planner' },
        { href: `/gilde/${ctx.memberGuild.slug}/meine-zuweisungen`, label: 'My Assignments' },
      ]
    : [];

  const guildName = ctx?.adminGuild?.name ?? ctx?.memberGuild?.name ?? null;
  const guildSlug = ctx?.adminGuild?.slug ?? ctx?.memberGuild?.slug ?? null;

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">

        {/* Left: brand + nav areas */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-semibold uppercase tracking-[0.2em] text-blue-300"
          >
            SWGOH Manager
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            {/* Admin area */}
            <NavSection label="Admin" links={adminLinks} pathname={pathname} />

            {/* Divider — only when both areas exist */}
            {memberLinks.length > 0 && (
              <span className="hidden h-5 w-px bg-gray-700 lg:inline-block" aria-hidden />
            )}

            {/* Member area */}
            {memberLinks.length > 0 && (
              <NavSection label="Member" links={memberLinks} pathname={pathname} />
            )}
          </div>
        </div>

        {/* Right: user info + logout */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-gray-200">{displayName}</span>
            {guildName && guildSlug && (
              <Link
                href={`/gilde/${guildSlug}`}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                {guildName}
              </Link>
            )}
          </div>
          <LogoutButton />
        </div>

      </div>
    </header>
  );
}
