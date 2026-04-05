'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Surface, Eyebrow } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { routes } from '@/lib/utils/routes';

import type { MemberRegistration } from '../_lib/types';

export function DashboardEmptyState({ memberRegistration }: { memberRegistration: MemberRegistration | null }) {
  const router = useRouter();
  const [joinSlug, setJoinSlug] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = joinSlug.trim().toLowerCase();
    if (slug) {
      router.push(routes.guildRegistration(slug));
    }
  }

  if (memberRegistration) {
    return (
      <Surface className="animate-fade-in overflow-hidden p-0" tone="info">
        <div className="border-b border-blue-900/50 bg-gradient-to-br from-indigo-950/80 via-slate-950 to-slate-950 px-6 py-6 sm:px-8">
          <Eyebrow className="text-indigo-300">Member workspace</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">You are already connected to a guild.</h1>
          <p className="mt-3 text-sm text-slate-300">
            Open your personal assignments and use the member workflow instead of starting a second setup.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="text-sm font-medium text-white">{memberRegistration.guildName}</div>
            <p className="mt-1 text-sm text-slate-400">Ally code {memberRegistration.allyCode}</p>
          </div>
          <Link href={routes.guildAssignments(memberRegistration.guildSlug)}>
            <Button size="lg">Open my assignments</Button>
          </Link>
        </div>
      </Surface>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2 animate-fade-in">
      <Surface tone="info" className="overflow-hidden p-0">
        <div className="border-b border-blue-900/50 bg-gradient-to-br from-indigo-950/80 via-slate-950 to-slate-950 px-6 py-6">
          <Eyebrow className="text-indigo-300">Officer setup</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">I manage a guild</h2>
          <p className="mt-2 text-sm text-slate-300">
            Connect your guild, sync members and make publishing, planning and assignments available from one admin workspace.
          </p>
        </div>
        <div className="px-6 py-6">
          <Link href={routes.guildSettings()}>
            <Button fullWidth size="lg">Set up my guild</Button>
          </Link>
        </div>
      </Surface>

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-slate-800 bg-slate-950/60 px-6 py-6">
          <Eyebrow>Member onboarding</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">I&apos;m a guild member</h2>
          <p className="mt-2 text-sm text-slate-400">
            Enter your guild slug, register your ally code and keep your own assignment view one click away.
          </p>
        </div>
        <form className="space-y-4 px-6 py-6" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Guild slug</span>
            <input
              type="text"
              placeholder="guild-slug"
              value={joinSlug}
              onChange={(event) => setJoinSlug(event.target.value)}
              className="min-w-0 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <Button type="submit" variant="secondary" fullWidth size="lg">
            Continue to registration
          </Button>
        </form>
      </Surface>
    </section>
  );
}
