import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(180deg,#020617_0%,#020617_100%)] text-white', className)}>
      {children}
    </div>
  );
}

export function AppContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8', className)}>{children}</div>;
}

export function AppHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end">
        <div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">{eyebrow}</p>
          ) : null}
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
          {description ? <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{description}</p> : null}
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
    </section>
  );
}

export function AppSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/20', className)}>{children}</section>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p> : null}
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  const toneClasses: Record<NonNullable<typeof tone>, string> = {
    neutral: 'border-white/10 bg-white/[0.03]',
    info: 'border-blue-900/70 bg-blue-950/30',
    success: 'border-emerald-900/70 bg-emerald-950/30',
    warning: 'border-amber-900/70 bg-amber-950/30',
    danger: 'border-rose-900/70 bg-rose-950/30',
  };

  return (
    <div className={cn('rounded-2xl border p-4', toneClasses[tone])}>
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
    </div>
  );
}
