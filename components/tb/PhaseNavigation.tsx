'use client';

import Link from 'next/link';

interface Props {
  instanceId: string;
  currentPhase: number;
  totalPhases: number;
}

export function PhaseNavigation({ instanceId, currentPhase, totalPhases }: Props) {
  return (
    <div className="mt-5 rounded-2xl border border-gray-800/80 bg-gray-900/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Phases
        </p>
        <p className="text-xs text-gray-500">
          Phase {currentPhase} of {totalPhases}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: totalPhases }, (_, i) => i + 1).map((phase) => (
          <Link
            key={phase}
            href={`/tb/${instanceId}/phase/${phase}`}
            className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              phase === currentPhase
                ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'border-gray-800 bg-gray-950/80 text-gray-300 hover:border-gray-700 hover:bg-gray-800 hover:text-white'
            }`}
          >
            Phase {phase}
          </Link>
        ))}
      </div>
    </div>
  );
}
