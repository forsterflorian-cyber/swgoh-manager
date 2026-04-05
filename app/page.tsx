import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Eyebrow, Surface } from '@/components/ui/Surface';
import { routes } from '@/lib/utils/routes';

const VALUE_POINTS = [
  {
    title: 'Officer workflow',
    body: 'Sync rosters, inspect bottlenecks, publish assignments and track TB readiness without jumping between tools.',
  },
  {
    title: 'Member workflow',
    body: 'Register once, open your guild board and immediately see what you need to build or place.',
  },
  {
    title: 'Shared source of truth',
    body: 'Public boards, matching and planning views use the same guild data instead of parallel spreadsheets and screenshots.',
  },
];

const ONBOARDING_STEPS = [
  'Connect a guild and sync the roster.',
  'Choose the workspace you need: officer or member.',
  'Use matching, planner and assignments from one navigation model.',
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AppShell className="py-10 sm:py-14" width="7xl">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <Surface className="overflow-hidden p-0" tone="info">
            <div className="border-b border-blue-900/60 bg-gradient-to-br from-indigo-950/80 via-slate-950 to-slate-950 px-6 py-8 sm:px-8 sm:py-10">
              <Eyebrow className="text-indigo-300">Territory Battle operations</Eyebrow>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                A guild planning app, not a pile of screens.
              </h1>
              <p className="mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
                SWGOH Manager organizes officer setup, member assignments and platoon planning into one clear app flow.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={routes.dashboard()}>
                  <Button variant="primary" size="lg">Open app</Button>
                </Link>
                <Link href={routes.login()}>
                  <Button variant="secondary" size="lg">Sign in</Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6 sm:px-8 sm:py-8 lg:grid-cols-3">
              {VALUE_POINTS.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
                </div>
              ))}
            </div>
          </Surface>

          <div className="grid gap-6">
            <Surface tone="default">
              <Eyebrow>Getting started</Eyebrow>
              <div className="mt-5 space-y-3">
                {ONBOARDING_STEPS.map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <p className="text-sm text-slate-300">{step}</p>
                  </div>
                ))}
              </div>
            </Surface>

            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard title="Officer setup" value="1 flow" detail="Guild, sync and publishing" />
              <StatCard title="Member access" value="1 board" detail="Assignments, matching and planner" />
            </div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}
