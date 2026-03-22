import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-slate-800 bg-slate-900 text-slate-300',
  success: 'border-emerald-800 bg-emerald-950/70 text-emerald-200',
  warning: 'border-amber-800 bg-amber-950/70 text-amber-200',
  danger: 'border-rose-800 bg-rose-950/70 text-rose-200',
  info: 'border-blue-800 bg-blue-950/70 text-blue-200',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-xs',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'error';
  label: string;
  className?: string;
}

const statusVariants: Record<StatusBadgeProps['status'], BadgeVariant> = {
  active: 'success',
  inactive: 'neutral',
  pending: 'warning',
  error: 'danger',
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status]} className={className}>
      {label}
    </Badge>
  );
}