'use client';

import Link from 'next/link';

interface Props {
  instanceId: string;
  currentPhase: number;
  totalPhases: number;
}

export function PhaseNavigation({ instanceId, currentPhase, totalPhases }: Props) {
  return (
    <div className="flex items-center gap-2 mt-4">
      {Array.from({ length: totalPhases }, (_, i) => i + 1).map((phase) => (
        <Link
          key={phase}
          href={`/tb/${instanceId}/phase/${phase}`}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-all
            ${phase === currentPhase
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }
          `}
        >
          Phase {phase}
        </Link>
      ))}
    </div>
  );
}
