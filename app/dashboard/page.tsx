'use client';

import { useEffect, useState } from 'react';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type DashboardGuild = {
  id: string;
  name: string;
  slug: string;
  swgoh_gg_id: string | null;
  memberCount: number;
};

type GuildMemberSummary = {
  ally_code: string;
  player_name: string;
};

export default function DashboardPage() {
  const [guild, setGuild] = useState<DashboardGuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    current: number;
    total: number;
    msg: string;
  } | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await fetch('/api/dashboard');
        const data = (await res.json()) as ApiEnvelope<{ guild: DashboardGuild | null }>;

        if (!data.ok) {
          throw new Error(data.error);
        }

        setGuild(data.data.guild);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Dashboard konnte nicht geladen werden');
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  const handleSync = async () => {
    if (!guild?.id) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setSyncStatus({ current: 0, total: 0, msg: 'Initialisiere Gilde...' });
      const initRes = await fetch(`/api/guild/${guild.id}/sync`, { method: 'POST' });
      const initData = (await initRes.json()) as ApiEnvelope<{ imported: number; total: number }>;

      if (!initRes.ok || !initData.ok) {
        throw new Error(initData.ok ? 'Gilden-Import fehlgeschlagen.' : initData.error);
      }

      const membersRes = await fetch(`/api/guild/${guild.id}/members`);
      const membersData = (await membersRes.json()) as ApiEnvelope<{
        members: GuildMemberSummary[];
      }>;

      if (!membersRes.ok || !membersData.ok) {
        throw new Error(
          membersData.ok ? 'Mitglieder konnten nicht geladen werden.' : membersData.error
        );
      }

      const members = membersData.data.members;
      if (!members || members.length === 0) {
        throw new Error('Keine Mitglieder gefunden.');
      }

      setSyncStatus({
        current: 0,
        total: members.length,
        msg: 'Starte Roster-Sync...',
      });

      let count = 0;
      for (const member of members) {
        count += 1;
        setSyncStatus({
          current: count,
          total: members.length,
          msg: `Sync: ${member.player_name}...`,
        });

        const res = await fetch(`/api/guild/${guild.id}/sync?allyCode=${member.ally_code}`, {
          method: 'POST',
        });
        const data = (await res.json()) as ApiEnvelope<{ syncedUnits: number }>;

        if (!res.ok || !data.ok) {
          throw new Error(
            data.ok ? `Roster-Sync fehlgeschlagen für ${member.player_name}` : data.error
          );
        }
      }

      setSyncStatus({
        current: members.length,
        total: members.length,
        msg: 'Sync erfolgreich abgeschlossen!',
      });

      const refreshRes = await fetch('/api/dashboard');
      const refreshData = (await refreshRes.json()) as ApiEnvelope<{
        guild: DashboardGuild | null;
      }>;

      if (refreshRes.ok && refreshData.ok) {
        setGuild(refreshData.data.guild);
      }

      setTimeout(() => setSyncStatus(null), 3000);
      alert('Sync erfolgreich abgeschlossen!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Synchronisierung fehlgeschlagen');
      alert(
        `Fehler: ${err instanceof Error ? err.message : 'Synchronisierung fehlgeschlagen'}`
      );
      setSyncStatus(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Lade Dashboard...</div>;
  }

  if (!guild) {
    return (
      <div className="p-8 text-center">
        <h1 className="mb-4 text-2xl font-bold">Willkommen!</h1>
        <p>Du hast noch keine Gilde verknuepft.</p>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button
          onClick={() => {
            window.location.href = '/guild/create';
          }}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          Gilde erstellen / beitreten
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-8 flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold">{guild.name}</h1>
          <p className="text-gray-500">Gilden-ID (swgoh.gg): {guild.swgoh_gg_id}</p>
        </div>
        <button
          onClick={() => void handleSync()}
          disabled={!!syncStatus}
          className={`rounded-lg px-6 py-2 font-medium text-white transition-colors ${
            syncStatus ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {syncStatus ? 'Synchronisiere...' : 'Roster synchronisieren'}
        </button>
      </div>

      {syncStatus && (
        <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="mb-2 flex justify-between">
            <span className="font-medium text-blue-700">{syncStatus.msg}</span>
            <span className="text-blue-600">
              {syncStatus.current} / {syncStatus.total}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${(syncStatus.current / (syncStatus.total || 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold text-gray-800">Mitglieder</h3>
          <p className="text-4xl font-bold text-blue-600">{guild.memberCount || 0}</p>
          <p className="mt-2 text-sm text-gray-500">Importierte Spieler in der Datenbank</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold text-gray-800">Status</h3>
          <p className="italic text-gray-600">
            {guild.memberCount > 0 ? 'Daten vorhanden' : 'Keine Daten geladen'}
          </p>
          <button
            onClick={() => {
              window.location.href = `/gilde/${guild.slug}`;
            }}
            className="mt-4 text-sm font-medium text-blue-600 hover:underline"
          >
            Details ansehen
          </button>
        </div>
      </div>
    </div>
  );
}
