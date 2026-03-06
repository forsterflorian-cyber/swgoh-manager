'use client';

import { useState, useEffect } from 'react';

// Typ-Definition für TypeScript
type Member = { ally_code: string; player_name: string };

export default function Home() {
  const [guildId, setGuildId] = useState('');
  const [status, setStatus] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  
  // Formular-State
  const [phase, setPhase] = useState('4');
  const [zone, setZone] = useState('Zeffo');
  const [character, setCharacter] = useState('KIADIMUNDI');
  const [relic, setRelic] = useState('7');
  const [selectedAlly, setSelectedAlly] = useState('');

  // Lädt die Mitglieder beim Start der Seite
  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      if (data.members) {
        setMembers(data.members);
      }
    } catch (error) {
      console.error("Fehler beim Laden der Mitglieder", error);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const syncGuild = async () => {
    setStatus('Synchronisiere Daten mit SWGOH.GG...');
    try {
      const res = await fetch('/api/sync-guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId })
      });
      const data = await res.json();
      setStatus(res.ok ? data.message : `Fehler: ${data.error}`);
      if (res.ok) fetchMembers(); // Aktualisiert die Dropdown-Liste
    } catch (error) {
      setStatus('Verbindungsfehler zum Backend.');
    }
  };

  const submitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase,
          zone,
          character_base_id: character,
          target_relic: parseInt(relic),
          assigned_ally_code: selectedAlly
        })
      });
      const data = await res.json();
      alert(res.ok ? data.message : `Fehler: ${data.error}`);
    } catch (error) {
      alert('Verbindungsfehler');
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px' }}>
      <h1>Gilden-Manager</h1>
      
      {/* Sync Sektion */}
      <section style={{ marginBottom: '2rem', padding: '1rem', background: '#e9ecef', borderRadius: '8px' }}>
        <h2>1. Gilde synchronisieren</h2>
        <input
          type="text"
          placeholder="SWGOH.GG Gilden-ID"
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          style={{ padding: '0.5rem', marginRight: '0.5rem' }}
        />
        <button onClick={syncGuild} style={{ padding: '0.5rem 1rem' }}>Abrufen</button>
        <p style={{ fontSize: '0.9rem', color: '#555' }}>{status}</p>
      </section>

      {/* Zuweisungs Sektion */}
      <section style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>2. TB-Zuweisung erstellen</h2>
        <form onSubmit={submitAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label>Phase:<br/><input value={phase} onChange={e => setPhase(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} /></label>
            <label>Zone:<br/><input value={zone} onChange={e => setZone(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} /></label>
          </div>

          <label>Charakter (Base ID):<br/>
            <input value={character} onChange={e => setCharacter(e.target.value)} placeholder="z.B. KIADIMUNDI" style={{ padding: '0.5rem', width: '100%' }} />
          </label>
          
          <label>Ziel Relikt-Stufe:<br/>
            <input type="number" value={relic} onChange={e => setRelic(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} />
          </label>

          <label>Spieler zuweisen:<br/>
            <select value={selectedAlly} onChange={e => setSelectedAlly(e.target.value)} required style={{ padding: '0.5rem', width: '100%' }}>
              <option value="">-- Spieler auswählen --</option>
              {members.map(m => (
                <option key={m.ally_code} value={m.ally_code}>{m.player_name}</option>
              ))}
            </select>
          </label>

          <button type="submit" style={{ padding: '0.5rem 1rem', background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Zuweisung speichern
          </button>
        </form>
      </section>

    </main>
  );
}