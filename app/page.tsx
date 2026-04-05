import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Eyebrow, Surface } from '@/components/ui/Surface';
import { routes } from '@/lib/utils/routes';

const APP_QUESTIONS = [
  'Which units are the biggest platoon bottlenecks across the guild?',
  'How many platoons can the current guild roster cover?',
  'Which zones are blocked by missing ownership or missing relic levels?',
  'Which upgrades unlock the most additional platoon coverage?',
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AppShell className="flex min-h-screen items-center py-16" width="6xl">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div>
            <Eyebrow className="text-blue-300">Strategic Platoon Planning</Eyebrow>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Find the guild-wide platoon bottlenecks before Territory Battle starts.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-gray-400">
              SWGOH Manager focuses on one operational question: which characters are missing
              across the guild for platoons, and which upgrades unlock the most coverage.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link href={routes.dashboard()}>
                <Button variant="primary" size="lg">Open dashboard</Button>
              </Link>
            </div>
          </div>

          <Surface className="p-0" tone="default">
            <Card className="border-0 bg-transparent p-5">
              <Eyebrow>What the app answers</Eyebrow>
              <div className="mt-5 space-y-4">
                {APP_QUESTIONS.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-4 text-sm text-gray-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          </Surface>
        </div>
      </AppShell>
    </div>
  );
}
