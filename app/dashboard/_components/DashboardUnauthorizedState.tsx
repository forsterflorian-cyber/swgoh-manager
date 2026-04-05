import Link from 'next/link';

import { Navbar } from '@/components/layout/Navbar';
import { AppShell } from '@/components/layout/AppShell';
import { Surface } from '@/components/ui/Surface';
import { routes } from '@/lib/utils/routes';

export function DashboardUnauthorizedState() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <AppShell width="6xl" className="py-16">
        <Surface className="animate-fade-in" tone="danger">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-rose)]">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Session expired</h2>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                Your session is no longer valid. Please log in again.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Link href={routes.login()} className="btn btn-primary">
              Log in again
            </Link>
          </div>
        </Surface>
      </AppShell>
    </div>
  );
}
