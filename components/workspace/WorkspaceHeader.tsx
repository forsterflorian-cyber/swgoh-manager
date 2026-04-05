import Link from 'next/link';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type WorkspaceTab = {
  href: string;
  label: string;
  active?: boolean;
};

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  chips,
  actions,
  tabs,
  backHref,
  backLabel = 'Back',
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  chips?: ReactNode;
  actions?: ReactNode;
  tabs?: WorkspaceTab[];
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'border-b border-slate-800 bg-gradient-to-b from-indigo-950/35 via-slate-950 to-slate-950',
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300 transition-colors hover:text-indigo-200"
          >
            <span aria-hidden="true">←</span>
            {backLabel}
          </Link>
        ) : null}

        <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">{description}</p>
            {chips ? <div className="mt-4 flex flex-wrap gap-2">{chips}</div> : null}
          </div>

          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>

        {tabs && tabs.length > 0 ? (
          <nav className="mt-6 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'rounded-xl border px-4 py-2 text-sm transition-colors',
                  tab.active
                    ? 'border-indigo-500/60 bg-indigo-950/50 text-white'
                    : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white',
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
