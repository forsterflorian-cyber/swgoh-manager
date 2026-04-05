import { Navbar } from '@/components/layout/Navbar';
import { AppShell } from '@/components/layout/AppShell';
import { Surface } from '@/components/ui/Surface';

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <AppShell>
        <Surface className="animate-pulse">
          <div className="h-8 w-48 rounded-lg bg-[var(--color-bg-tertiary)]" />
          <div className="mt-4 h-4 w-96 rounded bg-[var(--color-bg-tertiary)]" />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="metric-card">
                <div className="h-4 w-24 rounded bg-[var(--color-bg-tertiary)]" />
                <div className="mt-4 h-10 w-20 rounded bg-[var(--color-bg-tertiary)]" />
              </div>
            ))}
          </div>
        </Surface>
      </AppShell>
    </div>
  );
}
