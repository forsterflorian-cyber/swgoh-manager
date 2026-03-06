// app/gilde/[slug]/page.tsx

import { notFound } from 'next/navigation';
import { Metadata } from 'next';

// Dynamische Metadata
export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/public/guild/${params.slug}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) return { title: 'Guild not found' };

  const data = await res.json();
  return {
    title: `${data.guild.name} – TB Assignments`,
    description: `Territory Battle Zuweisungen für ${data.guild.name}`,
  };
}

export default async function PublicGuildPage({
  params,
}: {
  params: { slug: string };
}) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/api/public/guild/${params.slug}`, {
    next: { revalidate: 60 }, // 60s ISR
  });

  if (!res.ok) notFound();

  const data = await res.json();
  const { guild, activeTB, assignments, members } = data;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero Header */}
      <header className="bg-gradient-to-b from-blue-900/30 to-gray-950 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <h1 className="text-4xl font-bold">{guild.name}</h1>
          {activeTB ? (
            <div className="mt-4">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900/50
                               border border-blue-700 rounded-full">
                <span className={`w-2 h-2 rounded-full ${
                  activeTB.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'
                }`} />
                <span className="text-sm">
                  {activeTB.name} – {activeTB.status === 'active' ? 'Läuft' : 'In Planung'}
                </span>
              </span>
            </div>
          ) : (
            <p className="mt-4 text-gray-400">Keine aktive Territory Battle</p>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Quick Search - Client Component wird eingebettet */}
        <PublicSearchBar />

        {/* Assignments by Phase */}
        {activeTB && Object.keys(assignments).length > 0 ? (
          <div className="space-y-8 mt-8">
            {Object.entries(assignments).map(([phaseName, zones]: [string, any]) => (
              <div key={phaseName}>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center
                                   justify-center text-sm font-mono">
                    {phaseName.replace('Phase ', '')}
                  </span>
                  {phaseName}
                </h2>

                <div className="grid gap-4">
                  {Object.entries(zones).map(([zoneName, zoneAssignments]: [string, any]) => (
                    <div
                      key={zoneName}
                      className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800">
                        <h3 className="font-semibold">{zoneName}</h3>
                        <p className="text-xs text-gray-400">
                          {zoneAssignments.length} Zuweisungen
                        </p>
                      </div>

                      <div className="divide-y divide-gray-800">
                        {zoneAssignments.map((assignment: any, i: number) => (
                          <div
                            key={i}
                            className="grid grid-cols-3 md:grid-cols-4 gap-4 px-4 py-3
                                       items-center hover:bg-gray-800/30 transition-colors"
                          >
                            <div>
                              <p className="font-medium text-sm">{assignment.playerName}</p>
                              <p className="text-xs text-gray-500 font-mono">
                                {assignment.allyCode}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm">{assignment.unitName}</p>
                              <p className="text-xs text-gray-500">
                                {assignment.isPlatoon ? 'Platoon' : 'Combat'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                                assignment.playerRelic >= assignment.minRelic
                                  ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                                  : 'bg-red-900/50 text-red-300 border border-red-700'
                              }`}>
                                R{assignment.playerRelic}
                              </span>
                              <span className="text-xs text-gray-500">
                                / R{assignment.minRelic} benötigt
                              </span>
                            </div>
                            <div className="hidden md:block">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                assignment.status === 'confirmed'
                                  ? 'bg-emerald-900/50 text-emerald-300'
                                  : assignment.status === 'completed'
                                    ? 'bg-blue-900/50 text-blue-300'
                                    : 'bg-gray-700 text-gray-300'
                              }`}>
                                {assignment.status === 'assigned' ? '📋 Zugewiesen'
                                  : assignment.status === 'confirmed' ? '✅ Bestätigt'
                                  : assignment.status === 'completed' ? '🏆 Erledigt'
                                  : assignment.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-500">
            <p className="text-xl">Noch keine Zuweisungen vorhanden</p>
            <p className="mt-2">Der Gildenleiter bereitet die nächste TB vor.</p>
          </div>
        )}

        {/* Member List */}
        {members && members.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-4">Mitglieder ({members.length})</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 gap-4 px-4 py-2 bg-gray-800/50
                              text-xs text-gray-400 uppercase tracking-wider">
                <div>Spieler</div>
                <div>GP</div>
                <div>Zuweisungen</div>
              </div>
              {members.map((member: any) => (
                <div
                  key={member.ally_code}
                  className="grid grid-cols-3 gap-4 px-4 py-2 border-t
                             border-gray-800 hover:bg-gray-800/30"
                >
                  <div>
                    <p className="text-sm font-medium">{member.player_name}</p>
                    <p className="text-xs text-gray-500 font-mono">{member.ally_code}</p>
                  </div>
                  <div className="text-sm text-gray-300">
                    {member.galactic_power
                      ? `${(member.galactic_power / 1000000).toFixed(1)}M`
                      : '–'}
                  </div>
                  <div>
                    <span className={`text-sm ${
                      parseInt(member.assignment_count) > 0
                        ? 'text-blue-400'
                        : 'text-gray-500'
                    }`}>
                      {member.assignment_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          <p>SWGoH TB Manager • Daten werden alle 60 Sekunden aktualisiert</p>
          <p className="mt-1">
            Gildenleitung? <a href="/login" className="text-blue-400 hover:underline">
              Einloggen
            </a> um Zuweisungen zu bearbeiten.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Client Component für Suche
function PublicSearchBar() {
  // Wird in der nächsten Iteration als Client Component ausgelagert
  return (
    <div className="relative">
      <input
        type="text"
        placeholder="🔍 Spieler oder Unit suchen..."
        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl
                   text-sm focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}