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
      <Surface className="animate-fade-in" tone="info">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-blue)]">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <Eyebrow>Guild member</Eyebrow>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{memberRegistration.guildName}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Ally code {memberRegistration.allyCode}</p>
            <div className="mt-5">
              <Link href={routes.guildAssignments(memberRegistration.guildSlug)}>
                <Button>View my assignments</Button>
              </Link>
            </div>
          </div>
        </div>
      </Surface>
    );
  }

  return (
    <section className="grid gap-6 md:grid-cols-2 animate-fade-in">
      <Surface tone="info" className="flex flex-col">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-blue)]">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight">I manage a guild</h2>
        <p className="mt-2 flex-1 text-sm text-[var(--color-text-secondary)]">
          Connect your SWGOH guild, import members, and use the planner and matching tools.
        </p>
        <div className="mt-6">
          <Link href={routes.guildSettings()}>
            <Button fullWidth>Set up my guild</Button>
          </Link>
        </div>
      </Surface>

      <Surface className="flex flex-col">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-bg-tertiary)]">
          <svg className="h-6 w-6 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight">I&apos;m a guild member</h2>
        <p className="mt-2 flex-1 text-sm text-[var(--color-text-secondary)]">
          Enter your guild&apos;s slug to register with your ally code and view your assignments.
        </p>
        <form className="mt-6 flex gap-2" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="guild-slug"
            value={joinSlug}
            onChange={(event) => setJoinSlug(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent-blue)] focus:outline-none"
          />
          <Button type="submit" className="shrink-0">
            Join
          </Button>
        </form>
      </Surface>
    </section>
  );
}
