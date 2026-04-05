'use client';

import { cn } from '@/lib/utils/cn';

export type WorkspaceMode = 'admin' | 'member';

export function WorkspaceSwitcher({
  value,
  onChange,
  adminAvailable,
  memberAvailable,
  className,
}: {
  value: WorkspaceMode;
  onChange: (next: WorkspaceMode) => void;
  adminAvailable: boolean;
  memberAvailable: boolean;
  className?: string;
}) {
  const options = [
    adminAvailable ? { key: 'admin' as const, label: 'Officer workspace' } : null,
    memberAvailable ? { key: 'member' as const, label: 'Member workspace' } : null,
  ].filter(Boolean) as Array<{ key: WorkspaceMode; label: string }>;

  if (options.length <= 1) {
    return null;
  }

  return (
    <div className={cn('inline-flex rounded-2xl border border-slate-800 bg-slate-900/80 p-1', className)}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
