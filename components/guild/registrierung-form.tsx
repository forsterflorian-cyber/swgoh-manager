'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { Button } from '@/components/ui/Button';
import { routes } from '@/lib/utils/routes';
import type { ApiEnvelope } from '@/lib/types/api';


type Registration = {
  id: string;
  guild_id: string;
  discord_user_id: string;
  ally_code: string;
  guild_member_id: string;
  status: string;
  registered_at: string;
  updated_at: string;
};

type Props = {
  guildId: string;
  guildName: string;
  guildSlug: string;
};

function Notice({ tone, message }: { tone: 'error' | 'success'; message: string }) {
  return (
    <div
      className={
        tone === 'success'
          ? 'rounded-2xl border border-emerald-900/70 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200'
          : 'rounded-2xl border border-rose-900/70 bg-rose-950/30 px-4 py-3 text-sm text-rose-200'
      }
    >
      {message}
    </div>
  );
}

function StepCard({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          {index}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-400">{body}</div>
        </div>
      </div>
    </div>
  );
}

export function RegistrierungForm({ guildId, guildName, guildSlug }: Props) {
  const { status: sessionStatus } = useSession();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [allyCode, setAllyCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setLoading(false);
      return;
    }

    async function loadRegistration() {
      try {
        const res = await fetch(`/api/guild/${guildId}/register`);
        const payload = (await res.json()) as ApiEnvelope<{ registration: Registration | null }>;
        if (payload.ok) {
          setRegistration(payload.data.registration);
        }
      } catch {
        // show form anyway
      } finally {
        setLoading(false);
      }
    }

    void loadRegistration();
  }, [guildId, sessionStatus]);

  const normalizedAllyCode = useMemo(
    () => allyCode.replace(/[^0-9]/g, '').slice(0, 9),
    [allyCode],
  );

  const formattedAllyCode = useMemo(() => {
    if (!normalizedAllyCode) return '';
    return normalizedAllyCode.replace(/(\d{3})(?=\d)/g, '$1-');
  }, [normalizedAllyCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/guild/${guildId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allyCode: normalizedAllyCode }),
      });
      const payload = (await res.json()) as ApiEnvelope<{ registration: Registration }>;

      if (!res.ok || !payload.ok) {
        setError(!payload.ok ? payload.error : 'Registration failed');
        return;
      }

      setRegistration(payload.data.registration);
      setAllyCode('');
      setSuccess('Registration complete. Your member workspace is ready.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setSuccess(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/guild/${guildId}/register`, { method: 'DELETE' });
      const payload = (await res.json()) as ApiEnvelope<{ ok: boolean }>;

      if (!res.ok || !payload.ok) {
        setError(!payload.ok ? payload.error : 'Failed to unregister');
        return;
      }

      setRegistration(null);
      setSuccess('Registration removed.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-400">
        Loading member profile…
      </div>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div className="space-y-5">
        <Notice tone="error" message="Sign in first so the guild can link your Discord account to your SWGOH roster." />
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="text-sm text-slate-300">You are opening the member workspace for {guildName}.</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`/login?callbackUrl=${routes.guildRegistration(guildSlug)}`}>
              <Button>Log in</Button>
            </Link>
            <Link href={routes.publicGuildBoard(guildSlug)}>
              <Button variant="secondary">Back to guild board</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="error" message={error} /> : null}
      {success ? <Notice tone="success" message={success} /> : null}

      {registration ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">Member linked</div>
                <div className="mt-3 text-2xl font-semibold text-white">{guildName}</div>
                <div className="mt-2 text-sm text-slate-300">Your account is connected and ready for assignments.</div>
              </div>
              <Link href={routes.guildAssignments(guildSlug)}>
                <Button size="lg">Open my assignments</Button>
              </Link>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-900/50 bg-slate-950/40 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Ally code</div>
                <div className="mt-3 font-mono text-lg text-white">{registration.ally_code}</div>
              </div>
              <div className="rounded-2xl border border-emerald-900/50 bg-slate-950/40 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Registered</div>
                <div className="mt-3 text-lg text-white">{new Date(registration.registered_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-3">
              <StepCard index={1} title="Assignments" body="Open your personal assignment view to see current platoon placements." />
              <StepCard index={2} title="Matching" body="Use the member board to understand missing units and where your roster helps." />
              <StepCard index={3} title="Planner" body="Use the public planner for broader placement context without officer-only controls." />
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <div className="text-sm font-medium text-white">Need to change ally code?</div>
              <div className="mt-2 text-sm text-slate-400">Remove this registration and register again with the correct synced roster.</div>
              <div className="mt-5">
                <Button variant="danger" size="sm" isLoading={deleting} onClick={handleDelete}>
                  Remove registration
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StepCard index={1} title="Sign in" body="Your Discord identity is used as the stable member key." />
            <StepCard index={2} title="Enter ally code" body="Use the roster synced for this guild, not a secondary account." />
            <StepCard index={3} title="Open member workspace" body="Assignments and guidance stay attached to this one setup." />
          </div>

          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Registration</div>
            <div className="mt-3 text-base font-medium text-white">Link your account to {guildName}</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Enter the ally code that belongs to your synced guild roster. The format is accepted with or without dashes.
            </p>

            <div className="mt-6 space-y-2">
              <label htmlFor="ally-code" className="block text-sm font-medium text-slate-300">
                Ally code
              </label>
              <input
                id="ally-code"
                type="text"
                inputMode="numeric"
                placeholder="123-456-789"
                value={formattedAllyCode}
                onChange={(e) => setAllyCode(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-lg tracking-[0.12em] text-white placeholder-slate-600 outline-none transition-colors focus:border-indigo-500"
              />
              <div className="text-xs text-slate-500">Only digits are stored. Example: 123456789.</div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="submit" size="lg" isLoading={submitting} disabled={normalizedAllyCode.length !== 9}>
                Register member profile
              </Button>
              <Link href={routes.guildAssignments(guildSlug)}>
                <Button variant="secondary" size="lg">Open assignments</Button>
              </Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
