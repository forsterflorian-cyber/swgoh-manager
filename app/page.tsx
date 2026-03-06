'use client';

import { useState } from 'react';

export default function Home() {
  const [guildId, setGuildId] = useState('');
  const [status, setStatus] = useState('');

  const syncGuild = async () => {
    setStatus('Synchronisiere Daten mit SWGOH.GG...');
    try {
      const res = await fetch('/api/sync-guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId })
      });
      const data = await res.json();
      
      if (res.ok) {
        setStatus(data.message);
      } else {
        setStatus(`Fehler: ${data.error}`);
      }
    } catch (error) {
      setStatus('Verbindungsfehler zum Backend.');
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Gilden-Manager</h1>
      
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="SWGOH.GG Gilden-ID"
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          style={{ padding: '0.5rem', marginRight: '0.5rem', border: '1px solid #ccc' }}
        />
        <button 
          onClick={syncGuild} 
          style={{ padding: '0.5rem 1rem', background: '#333', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Gilde abrufen & speichern
        </button>
      </div>
      
      <p style={{ color: '#555' }}>{status}</p>
    </main>
  );
}