'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { LogoutButton } from '@/components/auth/logout-button';
import type { ApiEnvelope } from '@/lib/types/api';
import { cn } from '@/lib/utils/cn';
import { routes } from '@/lib/utils/routes';

import { WorkspaceSwitcher, type WorkspaceMode } from './WorkspaceSwitcher';

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

type NavLink = { href: string; label: string; hint?: string };

function WorkspaceLink({ href, label, hint, pathname }: NavLink & { pathname: string }) {
  const active = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={cn(
        'rounded-2xl border px-4 py-3 transition-colors',
        active
          ? 'border-indigo-500/60 bg-indigo-950/50 text-white'
          : 'border-slate-800 bg-slate-900/70 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
      )}
    >
      <div className="text-sm font-medium">{label}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [ctx, setCtx] = useState<NavContext | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceMode>('admin');

  const displayName = session?.user?.name?.trim() || session?.user?.email?.trim() || null;

  useEffect(() => {
    if (status !== 'authenticated') return;

    fetch('/api/me/nav-context')
      .then((r) => r.json())
      .then((payload: ApiEnvelope<NavContext>) => {
        if (payload.ok) setCtx(payload.data);
      })
      .catch(() => {
        /* non-critical */
      });
  }, [status]);

  const hasAdminWorkspace = Boolean(ctx?.adminGuild);
  const hasMemberWorkspace = Boolean(ctx?.memberGuild);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('swgoh-workspace-mode');
    if (stored === 'admin' || stored === 'member') {
      setWorkspace(stored);
    }
  }, []);

  useEffect(() => {
    if (hasAdminWorkspace && !hasMemberWorkspace) {
      setWorkspace('admin');
      return;
    }

    if (!hasAdminWorkspace && hasMemberWorkspace) {
      setWorkspace('member');
    }
  }, [hasAdminWorkspace, hasMemberWorkspace]);

  function handleWorkspaceChange(next: WorkspaceMode) {
    setWorkspace(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('swgoh-workspace-mode', next);
    }
  }

  const nav = useMemo(() => {
    const adminLinks: NavLink[] = hasAdminWorkspace
      ? [
          { href: routes.dashboard(), label: 'Overview', hint: 'Guild health, sync, publishing' },
          ...(ctx?.adminGuild?.canManageGuild
            ? [{ href: routes.guildSettings(), label: 'Guild settings', hint: 'Guild setup, roles and sync' }]
            : []),
          ctx?.adminGuild
            ? {
                href: routes.publicGuildBoard(ctx.adminGuild.slug),
                label: 'Guild board',
                hint: 'What members can see publicly',
              }
            : null,
        ].filter(Boolean) as NavLink[]
      : [];

    const memberLinks: NavLink[] = ctx?.memberGuild
      ? [
          { href: routes.guildAssignments(ctx.memberGuild.slug), label: 'My assignments', hint: 'Your published tasks' },
          { href: routes.guildRegistration(ctx.memberGuild.slug), label: 'Registration', hint: 'Link ally code and guild' },
          { href: routes.publicMatching(ctx.memberGuild.slug), label: 'Matching board', hint: 'Missing units and coverage' },
          { href: routes.publicSimulator(ctx.memberGuild.slug), label: 'Planner', hint: 'Read-only planning view' },
        ]
      : [];

    const activeWorkspace: WorkspaceMode = workspace === 'member' && hasMemberWorkspace ? 'member' : 'admin';

    return {
      activeWorkspace,
      links: activeWorkspace === 'member' ? memberLinks : adminLinks,
      guildName:
        activeWorkspace === 'member'
          ? ctx?.memberGuild?.name ?? ctx?.adminGuild?.name ?? null
          : ctx?.adminGuild?.name ?? ctx?.memberGuild?.name ?? null,
      guildSlug:
        activeWorkspace === 'member'
          ? ctx?.memberGuild?.slug ?? ctx?.adminGuild?.slug ?? null
          : ctx?.adminGuild?.slug ?? ctx?.memberGuild?.slug ?? null,
      subtitle:
        activeWorkspace === 'member'
          ? 'Member workflow'
          : hasAdminWorkspace
            ? 'Officer workflow'
            : 'Workspace',
    };
  }, [ctx, hasAdminWorkspace, hasMemberWorkspace, workspace]);

  if (status !== 'authenticated' || !displayName) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-[rgba(2,6,23,0.92)] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
              <Link href={routes.dashboard()} className="shrink-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-300">
                  SWGOH Manager
                </div>
                <div className="mt-1 text-sm text-slate-400">Guild operations, assignments and platoon planning</div>
              </Link>

              <WorkspaceSwitcher
                value={nav.activeWorkspace}
                onChange={handleWorkspaceChange}
                adminAvailable={hasAdminWorkspace}
                memberAvailable={hasMemberWorkspace}
              />
            </div>

            <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {nav.links.length > 0 ? (
                nav.links.map((link) => (
                  <WorkspaceLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    hint={link.hint}
                    pathname={pathname}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-400">
                  No workspace is connected yet. Start with guild setup or member registration.
                </div>
              )}
            </nav>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 xl:min-w-[18rem]">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{nav.subtitle}</div>
              <div className="mt-2 text-sm font-medium text-white">{displayName}</div>
              {nav.guildName && nav.guildSlug ? (
                <Link href={routes.publicGuildBoard(nav.guildSlug)} className="mt-1 block text-sm text-slate-400 hover:text-slate-200">
                  {nav.guildName}
                </Link>
              ) : (
                <div className="mt-1 text-sm text-slate-500">No guild selected</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link href={routes.home()} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-700 hover:text-white">
                Home
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
