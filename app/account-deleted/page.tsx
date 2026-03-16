'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';

export default function AccountDeletedPage() {
  useEffect(() => {
    void signOut({
      callbackUrl: '/login?deleted=1',
      redirect: true,
    });
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-20">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-8">
          <p className="text-sm text-slate-400">Account cleanup</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Signing you out…
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Your account was deleted. You are being signed out now.
          </p>
        </section>
      </div>
    </main>
  );
}