'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useEffect } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Eyebrow, Surface } from '@/components/ui/Surface';
import { routes } from '@/lib/utils/routes';

const LOGIN_BENEFITS = [
  'Officer and member workspaces under one account',
  'Direct access to assignments, matching and planning',
  'Cleaner onboarding after guild setup or registration',
];

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(routes.dashboard());
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AppShell className="flex min-h-screen items-center py-12" width="6xl">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
          <Surface tone="info" className="overflow-hidden p-0">
            <div className="border-b border-blue-900/50 bg-gradient-to-br from-indigo-950/80 via-slate-950 to-slate-950 px-6 py-8 sm:px-8">
              <Eyebrow className="text-indigo-300">Welcome back</Eyebrow>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">Sign in to your guild workspace.</h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300">
                Use one account for officer tools, member views and public planning surfaces.
              </p>
            </div>
            <div className="space-y-3 px-6 py-6 sm:px-8 sm:py-8">
              {LOGIN_BENEFITS.map((benefit) => (
                <div key={benefit} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
                  {benefit}
                </div>
              ))}
            </div>
          </Surface>

          <Surface className="self-center">
            <Eyebrow>Access</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Choose a sign-in method</h2>
            <p className="mt-2 text-sm text-slate-400">
              After sign-in you land in the app overview and can switch between available workspaces.
            </p>

            <div className="mt-6 space-y-4">
              <Button
                onClick={() => void signIn('discord', { callbackUrl: routes.dashboard() })}
                className="w-full justify-center bg-[#5865F2] hover:border-[#4752C4] hover:bg-[#4752C4]"
                size="lg"
              >
                Mit Discord anmelden
              </Button>

              {process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true' && (
                <button
                  onClick={() => void signIn('google', { callbackUrl: routes.dashboard() })}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700 bg-white px-5 py-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Mit Google anmelden
                </button>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
              New here? Start with guild setup as an officer or with guild registration as a member.
            </div>

            <div className="mt-6">
              <Link href={routes.home()} className="text-sm text-slate-400 transition-colors hover:text-white">
                Zurück zur Startseite
              </Link>
            </div>
          </Surface>
        </div>
      </AppShell>
    </div>
  );
}
