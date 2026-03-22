import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type CardVariant = 'default' | 'highlight' | 'success' | 'warning' | 'danger';

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'border-slate-800 bg-slate-950/70',
  highlight: 'border-indigo-800 bg-indigo-950/30',
  success: 'border-emerald-800 bg-emerald-950/30',
  warning: 'border-amber-800 bg-amber-950/30',
  danger: 'border-rose-800 bg-rose-950/30',
};

export function Card({ variant = 'default', className, children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}