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
          Public Link: <a href={`/gilde/${guild.slug}`} className="text-blue-400 hover:underline">
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
            onClick={() => router.push(`/dashboard/tb/new`)}
          />
          <ActionCard
            title="👥 Mitglieder"
            description={`${guild.memberCount || 0} Mitglieder verwalten`}
            action="Verwalten"
            onClick={() => router.push(`/dashboard/members`)}
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
                      Status: {tb.status} • Erstellt: {new Date(tb.created_at).toLocaleDateString('de-DE')}
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

function ActionCard({
  title, description, action, onClick,
}: {
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="bg-gray