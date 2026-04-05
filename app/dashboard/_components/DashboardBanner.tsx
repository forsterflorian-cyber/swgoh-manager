import { Surface } from '@/components/ui/Surface';
import { cn } from '@/lib/utils/cn';

import type { Notice } from '../_lib/types';

export function DashboardErrorBanner({ message }: { message: string }) {
  return (
    <Surface className="mb-6 animate-fade-in" tone="danger">
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 text-[var(--color-accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm">{message}</span>
      </div>
    </Surface>
  );
}

export function DashboardNoticeBanner({ notice }: { notice: Notice }) {
  return (
    <Surface
      className={cn('mb-6 animate-fade-in', notice.tone === 'success' && 'shadow-[0_0_0_1px_rgba(16,185,129,0.15)]')}
      tone={notice.tone === 'success' ? 'success' : 'danger'}
    >
      <div className="flex items-center gap-3">
        {notice.tone === 'success' ? (
          <svg className="h-5 w-5 text-[var(--color-accent-emerald)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-[var(--color-accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <span className="text-sm">{notice.message}</span>
      </div>
    </Surface>
  );
}
