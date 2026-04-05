'use client';

import { FormEvent, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { buildPublicGuildTargetsUrl } from '@/lib/utils/base-url';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type FormNotice = {
  tone: 'success' | 'error';
  message: string;
};

type SyncState = 'idle' | 'loading' | 'success' | 'error';

type GuildSettingsFormProps = {
  appBaseUrl: string;
  initialGuildId: string;
  initialSlug: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function SectionTitle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{body}</div>
    </div>
  );
}

export function GuildSettingsForm({
  appBaseUrl,
  initialGuildId,
  initialSlug,
}: GuildSettingsFormProps) {
  const [guildId, setGuildId] = useState(initialGuildId);
  const [slug, setSlug] = useState(initialSlug);
  const [savedSlug, setSavedSlug] = useState(initialSlug);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [rosterSyncState, setRosterSyncState] = useState<SyncState>('idle');
  const [rosterSyncMessage, setRosterSyncMessage] = useState<string | null>(null);
  const trimmedSavedSlug = savedSlug.trim();
  const publicUrl = trimmedSavedSlug ? buildPublicGuildTargetsUrl(trimmedSavedSlug, appBaseUrl) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedGuildId = guildId.trim();
    const trimmedSlug = slug.trim();

    if (!trimmedGuildId) {
      setNotice({ tone: 'error', message: 'Guild ID is required.' });
      return;
    }

    if (!SLUG_PATTERN.test(trimmedSlug)) {
      setNotice({ tone: 'error', message: 'Guild slug must use lowercase letters, numbers, and hyphens only.' });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const response = await fetch('/api/guild/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: trimmedGuildId, slug: trimmedSlug }),
      });
      const payload = (await response.json()) as ApiEnvelope<{ guildId: string; slug: string }>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'Guild settings could not be saved.' : payload.error);
      }

      setGuildId(payload.data.guildId);
      setSlug(payload.data.slug);
      setSavedSlug(payload.data.slug);
      setNotice({ tone: 'success', message: 'Guild settings saved.' });
    } catch (error: unknown) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Guild settings could not be saved.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncState('loading');
    setSyncMessage(null);

    try {
      const response = await fetch('/api/guild/sync', { method: 'POST' });
      const payload = (await response.json()) as ApiEnvelope<{ success: boolean; inserted: number; updated: number; skipped: number }>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'Guild sync failed.' : payload.error);
      }

      const { inserted, updated } = payload.data;
      setSyncState('success');
      setSyncMessage(`Sync complete — ${inserted} added, ${updated} updated.`);
      window.location.reload();
    } catch (error: unknown) {
      setSyncState('error');
      setSyncMessage(error instanceof Error ? error.message : 'Guild sync failed.');
    }
  }

  async function handleRosterSync() {
    setRosterSyncState('loading');
    setRosterSyncMessage(null);

    const BATCH_LIMIT = 5;
    let offset = 0;
    let totalUpserts = 0;
    let totalMembers = 0;

    try {
      while (true) {
        setRosterSyncMessage(`Syncing rosters… ${offset} / ${totalMembers || '?'} members processed`);

        const response = await fetch(`/api/guild/roster-sync?limit=${BATCH_LIMIT}&offset=${offset}`, { method: 'POST' });
        const payload = (await response.json()) as ApiEnvelope<{
          processedMembers: number;
          totalEligibleMembers: number;
          remainingMembers: number;
          upserts: number;
          upsertErrors: number;
          done: boolean;
          nextOffset: number;
        }>;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.ok ? 'Roster sync failed.' : payload.error);
        }

        totalUpserts += payload.data.upserts;
        totalMembers = payload.data.totalEligibleMembers;
        offset = payload.data.nextOffset;

        if (payload.data.done) break;
      }

      setRosterSyncState('success');
      setRosterSyncMessage(`Roster sync complete — ${totalMembers} members, ${totalUpserts} rows upserted.`);
      window.location.reload();
    } catch (error: unknown) {
      setRosterSyncState('error');
      setRosterSyncMessage(error instanceof Error ? error.message : 'Roster sync failed.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
        <SectionTitle title="Guild identity" body="These values define the connected guild inside the app and the public slug members will share." />

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="guild-id" className="block text-sm font-medium text-slate-300">Guild ID</label>
            <input
              id="guild-id"
              value={guildId}
              onChange={(event) => setGuildId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-indigo-500"
              placeholder="phoenix-reborn-123"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="guild-slug" className="block text-sm font-medium text-slate-300">Public slug</label>
            <input
              id="guild-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-indigo-500"
              placeholder="phoenix-reborn"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-900/70 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          Changing the guild ID can invalidate existing member and roster sync results.
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" isLoading={saving}>Save guild settings</Button>
          {publicUrl ? (
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="lg">Open public board</Button>
            </a>
          ) : null}
        </div>

        {notice ? (
          <div className={notice.tone === 'success' ? 'mt-4 text-sm text-emerald-300' : 'mt-4 text-sm text-rose-300'}>
            {notice.message}
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <SectionTitle title="Guild member sync" body="Pull the current member list from Comlink into the local database before checking registrations or assignments." />
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" size="lg" isLoading={syncState === 'loading'} onClick={handleSync}>
              Sync guild members
            </Button>
          </div>
          {syncMessage ? (
            <div className={syncState === 'success' ? 'mt-4 text-sm text-emerald-300' : 'mt-4 text-sm text-rose-300'}>
              {syncMessage}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <SectionTitle title="Roster sync" body="Fetch roster rows in batches. This powers relic checks, member views and upgrade guidance." />
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" size="lg" isLoading={rosterSyncState === 'loading'} onClick={handleRosterSync}>
              Sync roster data
            </Button>
          </div>
          {rosterSyncMessage ? (
            <div className={rosterSyncState === 'success' ? 'mt-4 text-sm text-emerald-300' : 'mt-4 text-sm text-rose-300'}>
              {rosterSyncMessage}
            </div>
          ) : null}
        </div>
      </section>

      {publicUrl ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <SectionTitle title="Member-facing URL" body="This is the primary entry point for members. Keep it stable and share it instead of internal officer routes." />
          <div className="mt-4 break-all rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            {publicUrl}
          </div>
        </section>
      ) : null}
    </form>
  );
}
