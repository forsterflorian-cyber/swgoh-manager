// app/dashboard/page.tsx

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [guild, setGuild] = useState<any>(null);
  const [tbInstances, setTbInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchGuildData();
    }
  }, [session]);

  const fetchGuildData = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.guild) {
        setGuild(data.guild);
        setTbInstances(data.tbInstances || []);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
    setLoading(false);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500
                        border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!guild) {
    return <CreateGuildWizard onCreated={fetchGuildData} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold">{guild.name}</h1>
        <p className="text-gray-400 mt-1">
          Public Link:{' '}
          <a
            href={`/gilde/${guild.slug}`}
            className="text-blue-400 hover:underline"
          >
            /gilde/{guild.slug}
          </a>
        </p>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <ActionCard
            title="🔄 Roster Sync"
            description="Lade Roster-Daten aller 50 Mitglieder"
            action="Jetzt synchronisieren"
            onClick={async () => {
              const res = await fetch(`/api/guild/${guild.id}/sync`, {
                method: 'POST',
              });
              const data = await res.json();
              alert(`Synced: ${data.data?.synced || 0} Spieler`);
            }}
          />
          <ActionCard
            title="📋 Neue TB"
            description="Territory Battle planen und Zuweisungen erstellen"
            action="TB erstellen"
            onClick={() => router.push('/dashboard/tb/new')}
          />
          <ActionCard
            title="👥 Mitglieder"
            description={`${guild.memberCount || 0} Mitglieder verwalten`}
            action="Verwalten"
            onClick={() => router.push('/dashboard/members')}
          />
        </div>

        {/* Active TB Instances */}
        <h2 className="text-xl font-bold mt-12 mb-4">Aktive Territory Battles</h2>
        {tbInstances.length === 0 ? (
          <p className="text-gray-500">Keine aktiven TBs. Erstelle eine neue!</p>
        ) : (
          <div className="grid gap-4">
            {tbInstances.map((tb: any) => (
              <div
                key={tb.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4
                           hover:border-gray-700 transition-colors cursor-pointer"
                onClick={() => router.push(`/tb/${tb.id}/phase/1`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{tb.name || tb.tb_name}</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Status: {tb.status} • Erstellt:{' '}
                      {new Date(tb.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <span className="text-blue-400">→</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Action Card Component
// ============================================
function ActionCard({
  title,
  description,
  action,
  onClick,
}: {
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6
                    hover:border-gray-700 transition-colors">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-gray-400 mt-2">{description}</p>
      <button
        onClick={onClick}
        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500
                   rounded-lg text-sm font-medium transition-colors"
      >
        {action}
      </button>
    </div>
  );
}

// ============================================
// Create Guild Wizard (Erster Start)
// ============================================
function CreateGuildWizard({ onCreated }: { onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [guildName, setGuildName] = useState('');
  const [swgohGgId, setSwgohGgId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!guildName.trim()) {
      setError('Bitte einen Gildennamen eingeben');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/guild/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: guildName.trim(),
          swgohGgId: swgohGgId.trim() || null,
        }),
      });

      const data = await res.json();

      if (data.success) {
        onCreated();
      } else {
        setError(data.error || 'Erstellen fehlgeschlagen');
      }
    } catch (err) {
      setError('Netzwerkfehler');
    }

    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">⚔️ Willkommen!</h1>
          <p className="text-gray-400 mt-2">
            Verknüpfe deine Gilde, um loszulegen
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {/* Step 1: Guild Name */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Gildenname *
              </label>
              <input
                type="text"
                value={guildName}
                onChange={(e) => setGuildName(e.target.value)}
                placeholder="z.B. Order of the Jedi"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700
                           rounded-lg text-white placeholder-gray-500
                           focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                SWGOH.GG Guild ID (optional)
              </label>
              <input
                type="text"
                value={swgohGgId}
                onChange={(e) => setSwgohGgId(e.target.value)}
                placeholder="z.B. 12345"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700
                           rounded-lg text-white placeholder-gray-500
                           focus:outline-none focus:border-blue-500 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">
                Findest du in der URL: swgoh.gg/g/DIESE_ID/
              </p>
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-900/30 border border-red-700
                              rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500
                         rounded-lg font-medium transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? '⟳ Erstelle Gilde...' : 'Gilde erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}