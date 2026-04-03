'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/guild/${guildId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allyCode }),
      });
      const payload = (await res.json()) as ApiEnvelope<{ registration: Registration }>;

      if (!res.ok || !payload.ok) {
        setError(!payload.ok ? payload.error : 'Registration failed');
        return;
      }

      setRegistration(payload.data.registration);
      setAllyCode('');
      setSuccess('Successfully registered.');
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
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8 text-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8">
        <p className="text-sm text-gray-400">
          You need to log in with Discord to register as a guild member.
        </p>
        <Link
          href={`/login?callbackUrl=/gilde/${guildSlug}/registrieren`}
          className="mt-5 inline-flex rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Log in with Discord
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {registration ? (
        <div className="rounded-2xl border border-emerald-800 bg-emerald-950/20 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Registered
          </p>
          <p className="mt-3 text-lg font-semibold text-white">{guildName}</p>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex gap-3">
              <span className="w-28 text-gray-500">Ally code</span>
              <span className="font-mono text-gray-200">{registration.ally_code}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-28 text-gray-500">Registered</span>
              <span className="text-gray-200">
                {new Date(registration.registered_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="mt-6 border-t border-gray-800 pt-5">
            <p className="mb-4 text-sm text-gray-400">
              To change your ally code, remove your registration and re-register.
            </p>
            <Button variant="danger" size="sm" isLoading={deleting} onClick={handleDelete}>
              Remove registration
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            Register
          </p>
          <p className="mt-3 text-sm text-gray-400">
            Enter your SWGOH ally code to link your Discord account to your player profile in{' '}
            <span className="text-white">{guildName}</span>. Your ally code must match a synced
            guild member.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="ally-code" className="mb-2 block text-sm font-medium text-gray-300">
                Ally code
              </label>
              <input
                id="ally-code"
                type="text"
                inputMode="numeric"
                placeholder="123-456-789"
                value={allyCode}
                onChange={(e) => setAllyCode(e.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 font-mono text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <Button type="submit" isLoading={submitting} disabled={!allyCode.trim()}>
              Register
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
