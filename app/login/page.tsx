'use client';

import { Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

function LoginPageContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
        <div className="grid w-full gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-10 shadow-2xl shadow-slate-950/40">
            <p className="text-sm uppercase tracking-[0.3em] text-blue-300">SWGOH Manager</p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white">
              Guild operations without the officer spreadsheet mess
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
              Manage guild sync, publish matching views and give every member a clean task workspace for live TB assignments.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Sign in</p>
            <h2 className="mt-4 text-2xl font-semibold text-white">Continue with Discord</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              After sign-in you land in your workspace and can switch between officer and member views if both roles exist.
            </p>

            <button
              type="button"
              onClick={() => signIn('discord', { callbackUrl })}
              className="mt-8 inline-flex w-full items-center justify-center rounded-full border border-blue-500 bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Sign in with Discord
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-4 text-sm text-slate-300">
          Loading login…
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}