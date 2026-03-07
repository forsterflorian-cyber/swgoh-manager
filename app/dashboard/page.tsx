'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function DashboardPage() {
  const { data: session } = useSession();
  const [guild, setGuild] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{current: number, total: number, msg: string} | null>(null);

  // 1. Gilden-Daten beim Laden abrufen
  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        if (data.guild) {
          setGuild(data.guild);
        }
      } catch (err) {
        console.error("Fehler beim Laden des Dashboards", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  // 2. Die Sync-Logik (Browser -> swgoh.gg -> API)
  const handleSync = async () => {
    if (!guild?.swgoh_gg_id) return alert("Keine SWGOH.GG ID hinterlegt!");
    
    setSyncStatus({ current: 0, total: 0, msg: "Kontaktiere swgoh.gg..." });

    try {
      // SCHRITT A: Mitgliederliste von swgoh.gg laden (im Browser!)
      const swgohRes = await fetch(`https://swgoh.gg/api/guild-profile/${guild.swgoh_gg_id}/`);
      if (!swgohRes.ok) throw new Error("Cloudflare blockiert den Zugriff. Bitte swgoh.gg im neuen Tab öffnen.");
      
      const swgohData = await swgohRes.json();
      const members = swgohData.data.members;

      setSyncStatus({ current: 0, total: members.length, msg: "Speichere Mitgliederliste..." });

      // SCHRITT B: Mitglieder in deine DB schieben
      await fetch(`/api/guild/${guild.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'init', members })
      });

      // SCHRITT C: Jedes Roster einzeln laden und speichern
      let count = 0;
      for (const member of members) {
        count++;
        setSyncStatus({ current: count, total: members.length, msg: `Synchronisiere ${member.player_name}...` });

        try {
          const pRes = await fetch(`https://swgoh.gg/api/player/${member.ally_code}/`);
          if (pRes.ok) {
            const pData = await pRes.json();
            await fetch(`/api/guild/${guild.id}/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ 
  mode: 'player', 
  allyCode: member.ally_code.toString(), // Sicherstellen, dass es ein String ist
  playerData: pData 
})
            });
          }
        } catch (e) {
          console.error(`Fehler bei ${member.player_name}`, e);
        }
        
        // Kleine Pause für die Stabilität
        await new Promise(r => setTimeout(r, 300));
      }

      setSyncStatus({ current: members.length, total: members.length, msg: "Sync erfolgreich abgeschlossen!" });
      setTimeout(() => setSyncStatus(null), 3000);

    } catch (err: any) {
      alert(err.message);
      setSyncStatus(null);
    }
  };

  if (loading) return <div className="p-8">Lade Dashboard...</div>;

  if (!guild) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Willkommen!</h1>
        <p>Du hast noch keine Gilde verknüpft.</p>
        <button 
          onClick={() => window.location.href = '/guild/create'}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Gilde erstellen / beitreten
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold">{guild.name}</h1>
          <p className="text-gray-500">Gilden-ID: {guild.swgoh_gg_id}</p>
        </div>
        <button
          onClick={handleSync}
          disabled={!!syncStatus}
          className={`${
            syncStatus ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
          } text-white px-6 py-2 rounded-lg font-medium transition-colors`}
        >
          {syncStatus ? 'Synchronisiere...' : 'Roster synchronisieren'}
        </button>
      </div>

      {syncStatus && (
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between mb-2">
            <span className="font-medium text-blue-700">{syncStatus.msg}</span>
            <span className="text-blue-600">{syncStatus.current} / {syncStatus.total}</span>
          </div>
          <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${(syncStatus.current / syncStatus.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 border rounded-xl shadow-sm bg-white">
          <h3 className="text-lg font-semibold mb-2">Mitglieder</h3>
          <p className="text-4xl font-bold">{guild.memberCount || 0}</p>
          <p className="text-sm text-gray-500 mt-2">Importierte Spieler in der Datenbank</p>
        </div>
        
        <div className="p-6 border rounded-xl shadow-sm bg-white">
          <h3 className="text-lg font-semibold mb-2">Letzter Sync</h3>
          <p className="text-gray-600 italic">Noch nie synchronisiert</p>
          <button className="mt-4 text-blue-600 text-sm font-medium">Details ansehen →</button>
        </div>
      </div>
    </div>
  );
}