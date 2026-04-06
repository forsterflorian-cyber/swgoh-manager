'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { LayoutDashboard, Settings, UserRound, Swords, ClipboardList, ArrowUpRight, Sparkles } from 'lucide-react';

import { LogoutButton } from '@/components/auth/logout-button';
import { WorkspaceSwitcher, type WorkspaceMode, type WorkspaceOption } from '@/components/layout/WorkspaceSwitcher';
import type { ApiEnvelope } from '@/lib/types/api';
import { cn } from '@/lib/utils/cn';
import { routes } from '@/lib/utils/routes';

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

type NavItem = {
  href: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
};

function NavPill({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'group rounded-2xl border px-3 py-2 transition-colors',
        active
          ? 'border-blue-500 bg-blue-950/60 text-blue-100'
          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={cn('text-slate-500', active && 'text-blue-300')}>{item.icon}</span>
        {item.label}
      </div>
      <div className="mt-1 text-xs text-slate-500 group-hover:text-slate-400">{item.hint}</div>
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [ctx, setCtx] = useState<NavContext | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('officer');

  const displayName = session?.user?.name?.trim() || session?.user?.email?.trim() || null;

  useEffect(() => {
    if (status !== 'authenticated') return;

    fetch('/api/me/nav-context')
      .then((r) => r.json())
      .then((payload: ApiEnvelope<NavContext>) => {
        if (payload.ok) {
          setCtx(payload.data);
        }
      })
      .catch(() => {
        // non critical
      });
  }, [status]);

  const availableModes = useMemo(() => {
    const modes: WorkspaceMode[] = [];
    if (ctx?.adminGuild) modes.push('officer');
    if (ctx?.memberGuild) modes.push('member');
    return modes;
  }, [ctx]);

  useEffect(() => {
    if (availableModes.length === 1) {
      setWorkspaceMode(availableModes[0]);
    }
  }, [availableModes]);

  if (status !== 'authenticated' || !displayName) {
    return null;
  }

  const officerItems: NavItem[] = [
    {
      href: routes.dashboard(),
      label: 'Overview',
      hint: 'Guild status and sync health',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      href: routes.guildSettings(),
      label: 'Setup',
      hint: 'Guild identity and sharing',
      icon: <Settings className="h-4 w-4" />,
    },
    ...(ctx?.adminGuild?.slug
      ? [
          {
            href: routes.matching(ctx.adminGuild.slug),
            label: 'Public board',
            hint: 'Member-facing matching view',
            icon: <ArrowUpRight className="h-4 w-4" />,
          },
          {
            href: routes.simulator(ctx.adminGuild.slug),
            label: 'Simulator',
            hint: 'Sandbox and exports',
            icon: <Sparkles className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  const memberItems: NavItem[] = ctx?.memberGuild
    ? [
        {
          href: routes.registration(ctx.memberGuild.slug),
          label: 'Identity',
          hint: 'Register your ally code',
          icon: <UserRound className="h-4 w-4" />,
        },
        {
          href: routes.assignments(ctx.memberGuild.slug),
          label: 'Assignments',
          hint: 'Your current platoon tasks',
          icon: <ClipboardList className="h-4 w-4" />,
        },
        {
          href: routes.matching(ctx.memberGuild.slug),
          label: 'Guild board',
          hint: 'Read-only planning view',
          icon: <Swords className="h-4 w-4" />,
        },
        {
          href: routes.simulator(ctx.memberGuild.slug),
          label: 'Simulator',
          hint: 'Sandbox and exports',
          icon: <Sparkles className="h-4 w-4" />,
        },
      ]
    : [];

  const visibleItems = workspaceMode === 'member' && memberItems.length > 0 ? memberItems : officerItems;
  const guildLabel = workspaceMode === 'member' ? ctx?.memberGuild?.name : ctx?.adminGuild?.name;
  const guildHref = workspaceMode === 'member' && ctx?.memberGuild ? routes.publicGuild(ctx.memberGuild.slug) : ctx?.adminGuild?.slug ? routes.publicGuild(ctx.adminGuild.slug) : undefined;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={routes.dashboard()} className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">
                SWGOH Manager
              </Link>
              {availableModes.length > 1 ? (
                <WorkspaceSwitcher
                  options={([
                    { id: 'officer', label: 'Officer workspace', description: 'Setup, sync and publishing' },
                    { id: 'member', label: 'Member workspace', description: 'Registration and assignments' },
                  ] as WorkspaceOption[]).filter((option) => availableModes.includes(option.id))}
                  defaultMode={availableModes.includes('officer') ? 'officer' : 'member'}
                  onChange={setWorkspaceMode}
                />
              ) : null}
            </div>
            {guildLabel ? (
              <div className="text-sm text-slate-400">
                <span className="text-slate-500">Current workspace:</span>{' '}
                {guildHref ? <Link href={guildHref} className="font-medium text-slate-200 hover:text-white">{guildLabel}</Link> : guildLabel}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 self-start lg:self-auto">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-100">{displayName}</div>
              <div className="text-xs text-slate-500">{workspaceMode === 'member' ? 'Member mode' : 'Officer mode'}</div>
            </div>
            <LogoutButton />
          </div>
        </div>

        <nav className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <NavPill key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + '/')} />
          ))}
        </nav>
      </div>
    </header>
  );
}
