import Link from 'next/link';
import { type ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  badges,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
          {badges ? <div className="mt-4 flex flex-wrap gap-2">{badges}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

export function WorkspaceTabs({
  tabs,
  currentPath,
}: {
  tabs: Array<{ href: string; label: string; hint?: string }>;
  currentPath: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = currentPath === tab.href || currentPath.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-2xl border px-4 py-3 transition-colors',
              active ? 'border-blue-500 bg-blue-950/50 text-blue-100' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.05] hover:text-white',
            )}
          >
            <div className="text-sm font-medium">{tab.label}</div>
            {tab.hint ? <div className="mt-1 text-xs text-slate-500">{tab.hint}</div> : null}
          </Link>
        );
      })}
    </div>
  );
}

export function WorkspacePanel({
  title,
  description,
  children,
  action,
  tone = 'default',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'info' | 'success' | 'warning';
}) {
  const tones = {
    default: 'border-white/10 bg-slate-950/70',
    info: 'border-blue-900/60 bg-blue-950/20',
    success: 'border-emerald-900/60 bg-emerald-950/20',
    warning: 'border-amber-900/60 bg-amber-950/20',
  } as const;

  return (
    <section className={cn('rounded-[24px] border p-5 shadow-xl shadow-black/20', tones[tone])}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
          {description ? <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function EmptyStateCard({
  badge,
  title,
  description,
  action,
}: {
  badge?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      {badge ? <Badge variant="info">{badge}</Badge> : null}
      <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
