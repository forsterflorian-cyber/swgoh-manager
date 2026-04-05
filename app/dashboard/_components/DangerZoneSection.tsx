import { Button } from '@/components/ui/Button';
import { Surface } from '@/components/ui/Surface';

export function DangerZoneSection({ noGuildConnected }: { noGuildConnected: boolean }) {
  return (
    <Surface className="mt-8 animate-fade-in" tone="danger">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-rose)]">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Danger Zone</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Irreversible actions. Proceed with caution.</p>
        </div>
      </div>

      <div className="mt-6">
        {noGuildConnected ? (
          <form action="/api/account/delete" method="post">
            <Button type="submit" variant="danger">
              Delete account
            </Button>
          </form>
        ) : (
          <div>
            <Button disabled variant="danger" className="opacity-50">
              Delete account
            </Button>
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Delete guild first before deleting your account.</p>
          </div>
        )}
      </div>
    </Surface>
  );
}
