import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type SurfaceTone = 'default' | 'subtle' | 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<SurfaceTone, string> = {
  default: 'border-slate-800 bg-slate-900/70',
  subtle: 'border-slate-800 bg-slate-950/60',
  info: 'border-blue-900/70 bg-blue-950/25',
  success: 'border-emerald-900/70 bg-emerald-950/25',
  warning: 'border-amber-900/70 bg-amber-950/25',
  danger: 'border-rose-900/70 bg-rose-950/25',
};

export function Surface({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: SurfaceTone;
}) {
  return (
    <section className={cn('rounded-2xl border p-5 shadow-sm', toneClasses[tone], className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-slate-500', className)}>
      {children}
    </p>
  );
}
