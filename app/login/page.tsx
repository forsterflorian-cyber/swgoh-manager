'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, UserRound } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import { useEffect } from 'react';

import { AppContainer, AppSection, AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { routes } from '@/lib/utils/routes';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || routes.dashboard();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  if (status === 'loading') {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AppContainer className="flex min-h-screen items-center py-12">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
          <AppSection className="p-8 sm:p-10">
            <Badge variant="info">Sign in</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Log in once, then choose the right workspace.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Officers land in setup and guild operations. Members land in registration and personal assignments. If you are both, you can switch modes from the app navigation instead of juggling mixed screens.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-blue-900/60 bg-blue-950/30 p-5">
                <div className="inline-flex rounded-xl bg-blue-600/20 p-2 text-blue-300"><ShieldCheck className="h-5 w-5" /></div>
                <h2 className="mt-4 text-lg font-semibold">Officer workspace</h2>
                <p className="mt-2 text-sm text-slate-400">Guild setup, sync health, public links and live planning entry points.</p>
              </div>
              <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-5">
                <div className="inline-flex rounded-xl bg-emerald-600/20 p-2 text-emerald-300"><UserRound className="h-5 w-5" /></div>
                <h2 className="mt-4 text-lg font-semibold">Member workspace</h2>
                <p className="mt-2 text-sm text-slate-400">Identity registration, current assignments and player-specific upgrade guidance.</p>
              </div>
            </div>
          </AppSection>

          <AppSection className="p-8 sm:p-10">
            <h2 className="text-2xl font-semibold tracking-tight">Continue with your guild identity</h2>
            <p className="mt-2 text-sm text-slate-400">
              Discord is the primary login so member registration and guild permissions resolve against the right account.
            </p>

            <div className="mt-8 space-y-3">
              <Button
                fullWidth
                size="lg"
                className="justify-center bg-[#5865F2] hover:border-[#5865F2] hover:bg-[#4752C4]"
                onClick={() => void signIn('discord', { callbackUrl })}
              >
                Mit Discord anmelden
              </Button>

              {process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true' && (
                <Button
                  fullWidth
                  size="lg"
                  variant="secondary"
                  className="justify-center border-white/10 bg-white text-slate-950 hover:bg-slate-100"
                  onClick={() => void signIn('google', { callbackUrl })}
                >
                  Mit Google anmelden
                </Button>
              )}
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              After login, the app checks whether you manage a guild, belong to a registered guild as a member, or both.
            </div>

            <div className="mt-6">
              <Link href={routes.home()} className="text-sm text-slate-500 hover:text-slate-300">
                Zurück zur Startseite
              </Link>
            </div>
          </AppSection>
        </div>
      </AppContainer>
    </AppShell>
  );
}
