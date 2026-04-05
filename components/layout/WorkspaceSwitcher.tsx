'use client';

import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils/cn';

export type WorkspaceMode = 'officer' | 'member';

export type WorkspaceOption = {
  id: WorkspaceMode;
  label: string;
  description: string;
};

const STORAGE_KEY = 'swgoh-manager.workspace';

export function WorkspaceSwitcher({
  options,
  defaultMode,
  onChange,
}: {
  options: WorkspaceOption[];
  defaultMode: WorkspaceMode;
  onChange?: (mode: WorkspaceMode) => void;
}) {
  const [mode, setMode] = useState<WorkspaceMode>(defaultMode);

  const validDefault = useMemo(() => options.some((option) => option.id === defaultMode), [defaultMode, options]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY) as WorkspaceMode | null;
    if (stored && options.some((option) => option.id === stored)) {
      setMode(stored);
      onChange?.(stored);
      return;
    }

    if (validDefault) {
      setMode(defaultMode);
      onChange?.(defaultMode);
    }
  }, [defaultMode, onChange, options, validDefault]);

  if (options.length <= 1) {
    return null;
  }

  return (
    <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur">
      {options.map((option) => {
        const active = option.id === mode;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setMode(option.id);
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(STORAGE_KEY, option.id);
              }
              onChange?.(option.id);
            }}
            className={cn(
              'rounded-xl px-3 py-2 text-left transition-colors sm:px-4',
              active ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/40' : 'text-slate-300 hover:bg-white/5 hover:text-white',
            )}
          >
            <div className="text-sm font-medium">{option.label}</div>
            <div className={cn('text-xs', active ? 'text-blue-100/80' : 'text-slate-500')}>
              {option.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
