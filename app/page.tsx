import Link from 'next/link';
import { ArrowRight, ClipboardList, ShieldCheck, Users } from 'lucide-react';

import { AppContainer, AppHero, AppSection, AppShell, MetricTile, SectionHeader } from '@/components/app/AppShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { routes } from '@/lib/utils/routes';

export default function HomePage() {
  return (
    <AppShell>
      <AppContainer className="py-14 sm:py-20">
        <AppHero
          eyebrow="Territory Battle operations"
          title="One app for officer setup, guild visibility and member assignments."
          description="SWGOH Manager brings roster sync, platoon readiness, public guild boards and personal assignment views into one coherent workflow. Officers publish, members register, everyone sees the same state."
          actions={(
            <>
              <Link href={routes.login()}>
                <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>Open the app</Button>
              </Link>
              <Link href={routes.dashboard()}>
                <Button variant="secondary" size="lg">View dashboard</Button>
              </Link>
            </>
          )}
          aside={(
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricTile label="Officer workspace" value="Setup" detail="Guild identity, sync health and publishing" tone="info" />
              <MetricTile label="Member workspace" value="Assignments" detail="Registration, personal tasks and upgrade hints" tone="success" />
            </div>
          )}
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <AppSection>
            <Badge variant="info">For officers</Badge>
            <h2 className="mt-3 text-xl font-semibold">Run guild setup like an actual control surface</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connect the guild, sync roster data, publish matching and route officers into the live planner without dumping every admin action into one page.
            </p>
          </AppSection>
          <AppSection>
            <Badge variant="success">For members</Badge>
            <h2 className="mt-3 text-xl font-semibold">Give members a simple task-focused workspace</h2>
            <p className="mt-2 text-sm text-slate-400">
              Members register once, open their own assignment view and stop guessing which platoon slots or upgrades matter for the next TB.
            </p>
          </AppSection>
          <AppSection>
            <Badge>Shared state</Badge>
            <h2 className="mt-3 text-xl font-semibold">Keep public and protected views aligned</h2>
            <p className="mt-2 text-sm text-slate-400">
              Matching boards, simulator links and personal assignments all derive from the same guild configuration instead of feeling like separate tools.
            </p>
          </AppSection>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <AppSection>
            <SectionHeader
              eyebrow="How the app works"
              title="A cleaner flow from setup to action"
              description="The product model is explicit: officer setup, member identity, then execution during a live board."
            />
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: <ShieldCheck className="h-5 w-5" />,
                  title: '1. Connect the guild',
                  body: 'Configure guild ID and slug, then sync members and roster coverage into one canonical workspace.',
                },
                {
                  icon: <Users className="h-5 w-5" />,
                  title: '2. Register members',
                  body: 'Members link their Discord identity to an ally code once, so assignments and advice can target the right player.',
                },
                {
                  icon: <ClipboardList className="h-5 w-5" />,
                  title: '3. Publish and execute',
                  body: 'Use the public board and live planner as the operational layer instead of scattered ad-hoc links and messages.',
                },
              ].map((step) => (
                <div key={step.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="inline-flex rounded-xl border border-blue-900/60 bg-blue-950/30 p-2 text-blue-300">{step.icon}</div>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{step.body}</p>
                </div>
              ))}
            </div>
          </AppSection>

          <AppSection>
            <SectionHeader
              eyebrow="Questions the app answers"
              title="What officers and members can immediately see"
            />
            <div className="mt-6 space-y-3">
              {[
                'Which guild data is missing before planning can be trusted?',
                'Which public surfaces are ready to share with the guild?',
                'Which platoon assignments belong to me right now?',
                'Which upgrades unlock the most blocked platoon slots?',
                'Which workspace should I use when I am both officer and member?',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </AppSection>
        </div>
      </AppContainer>
    </AppShell>
  );
}
