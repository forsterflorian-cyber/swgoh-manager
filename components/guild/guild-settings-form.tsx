'use client';

import { FormEvent, useState } from 'react';

import { CopyPublicGuildLinkButton } from '@/components/guild/copy-public-guild-link-button';
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
  const publicUrl = trimmedSavedSlug
    ? buildPublicGuildTargetsUrl(trimmedSavedSlug, appBaseUrl)
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedGuildId = guildId.trim();
    const trimmedSlug = slug.trim();

    if (!trimmedGuildId) {
      setNotice({
        tone: 'error',
        message: 'Guild ID is required.',
      });
      return;
    }

    if (!SLUG_PATTERN.test(trimmedSlug)) {
      setNotice({
        tone: 'error',
        message: 'Guild slug must use lowercase letters, numbers, and hyphens only.',
      });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const response = await fetch('/api/guild/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guildId: trimmedGuildId,
          slug: trimmedSlug,
        }),
      });
      const payload = (await response.json()) as ApiEnvelope<{
        guildId: string;
        slug: string;
      }>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'Guild settings could not be saved.' : payload.error);
      }

      setGuildId(payload.data.guildId);
      setSlug(payload.data.slug);
      setSavedSlug(payload.data.slug);
      setNotice({
        tone: 'success',
        message: 'Guild settings saved.',
      });
    } catch (error: unknown) {
      setNotice({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Guild settings could not be saved.',
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
      const payload = (await response.json()) as ApiEnvelope<{
        success: boolean;
        inserted: number;
        updated: number;
        skipped: number;
      }>;

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

    try {
      const response = await fetch('/api/guild/roster-sync', { method: 'POST' });
      const payload = (await response.json()) as ApiEnvelope<{
        success: boolean;
        membersConsidered: number;
        membersFetched: number;
        membersSkipped: number;
        totalRosterRows: number;
        totalUpserts: number;
        totalUpsertErrors: number;
      }>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'Roster sync failed.' : payload.error);
      }

      const { membersFetched, totalUpserts, membersSkipped } = payload.data;
      setRosterSyncState('success');
      setRosterSyncMessage(
        `Roster sync complete — ${membersFetched} players, ${totalUpserts} rows upserted` +
          (membersSkipped > 0 ? `, ${membersSkipped} skipped.` : '.')
      );
      window.location.reload();
    } catch (error: unknown) {
      setRosterSyncState('error');
      setRosterSyncMessage(error instanceof Error ? error.message : 'Roster sync failed.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="guild-id" className="block text-sm font-medium text-gray-200">
          Guild ID
        </label>
        <input
          id="guild-id"
          value={guildId}
          onChange={(event) => setGuildId(event.target.value)}
          className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500"
          placeholder="phoenix-reborn-123"
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="guild-slug" className="block text-sm font-medium text-gray-200">
          Guild Slug
        </label>
        <input
          id="guild-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500"
          placeholder="phoenix-reborn"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>

      <p className="rounded-2xl border border-amber-900 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
        Changing the guild ID may require re-syncing roster data.
      </p>

      <div className="flex flex-wrap items-start gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>

        {publicUrl && <CopyPublicGuildLinkButton publicUrl={publicUrl} />}
      </div>

      {notice && (
        <p
          className={`text-sm ${
            notice.tone === 'success' ? 'text-emerald-300' : 'text-red-300'
          }`}
        >
          {notice.message}
        </p>
      )}

      <hr className="border-gray-800" />

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-200">Guild Members</p>
        <p className="text-xs text-gray-500">
          Pull the current member list from Comlink and sync it into the local database.
        </p>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncState === 'loading'}
          className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-700 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-600"
        >
          {syncState === 'loading' ? 'Syncing…' : 'Sync guild members'}
        </button>

        {syncMessage && (
          <p
            className={`text-sm ${
              syncState === 'success' ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {syncMessage}
          </p>
        )}
      </div>

      <hr className="border-gray-800" />

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-200">Player Rosters</p>
        <p className="text-xs text-gray-500">
          Fetch each member&apos;s full unit roster from Comlink and store it for strategic
          planning. Run after guild member sync.
        </p>
        <button
          type="button"
          onClick={handleRosterSync}
          disabled={rosterSyncState === 'loading'}
          className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-700 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-600"
        >
          {rosterSyncState === 'loading' ? 'Syncing rosters…' : 'Sync player rosters'}
        </button>

        {rosterSyncMessage && (
          <p
            className={`text-sm ${
              rosterSyncState === 'success' ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {rosterSyncMessage}
          </p>
        )}
      </div>
    </form>
  );
}
