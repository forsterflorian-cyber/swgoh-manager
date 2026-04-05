'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowRight, CheckCircle2, LogIn, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { ApiEnvelope } from '@/lib/types/api';
import { routes } from '@/lib/utils/routes';

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
    return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">Loading registration…</div>;
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold">Log in to continue</h2>
        <p className="text-sm text-slate-400">You need to authenticate before the app can link your Discord identity to a guild member record.</p>
        <Link href={routes.login(routes.registration(guildSlug))}>
          <Button leftIcon={<LogIn className="h-4 w-4" />}>Log in with Discord</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-2xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{success}</div> : null}

      {registration ? (
        <div className="rounded-2xl border border-emerald-800/70 bg-emerald-950/20 p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300"><CheckCircle2 className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Registered</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{guildName}</h2>
              <div className="mt-4 grid gap-2 text-sm text-slate-200">
                <div><span className="text-slate-500">Ally code:</span> <span className="font-mono">{registration.ally_code}</span></div>
                <div><span className="text-slate-500">Registered on:</span> {new Date(registration.registered_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-5">
            <Link href={routes.assignments(guildSlug)}>
              <Button variant="secondary" leftIcon={<ArrowRight className="h-4 w-4" />}>Open my assignments</Button>
            </Link>
            <Button variant="danger" size="sm" isLoading={deleting} leftIcon={<Trash2 className="h-4 w-4" />} onClick={handleDelete}>
              Remove registration
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Identity setup</p>
          <h2 className="mt-3 text-xl font-semibold">Link your ally code</h2>
          <p className="mt-2 text-sm text-slate-400">
            Enter the SWGOH ally code that matches a synced member in <span className="text-white">{guildName}</span>. The app uses this mapping to show your own assignments and upgrade priorities.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="ally-code" className="mb-2 block text-sm font-medium text-slate-300">Ally code</label>
              <input
                id="ally-code"
                type="text"
                inputMode="numeric"
                placeholder="123-456-789"
                value={allyCode}
                onChange={(e) => setAllyCode(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <Button type="submit" isLoading={submitting} disabled={!allyCode.trim()} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Register member identity
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
