import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { Surface } from '@/components/ui/Surface';

export function StatCard({
  title,
  value,
  detail,
  aside,
  className,
  tone = 'default',
}: {
  title: string;
  value: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  className?: string;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Surface className={cn('h-full', className)} tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
          {detail ? <p className="mt-2 text-sm text-slate-400">{detail}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </Surface>
  );
}
