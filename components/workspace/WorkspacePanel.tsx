import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export function WorkspacePanel({
  title,
  description,
  children,
  tone = 'default',
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: 'default' | 'info' | 'success' | 'warning';
  className?: string;
}) {
  const toneClass = {
    default: 'border-slate-800 bg-slate-900/70',
    info: 'border-blue-900/60 bg-blue-950/20',
    success: 'border-emerald-900/60 bg-emerald-950/20',
    warning: 'border-amber-900/60 bg-amber-950/20',
  }[tone];

  return (
    <section className={cn('rounded-2xl border p-5 shadow-sm', toneClass, className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description ? <p className="text-sm text-slate-400">{description}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function WorkspaceMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{detail}</div>
    </div>
  );
}
