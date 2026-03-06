'use client';

import { useState, useEffect } from 'react';

type Member = { ally_code: string; player_name: string };

export default function Home() {
  const [guildId, setGuildId] = useState('');
  const [status, setStatus] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  
  const [phase, setPhase] = useState('4');
  const [zone, setZone] = useState('Zeffo');
  const [character, setCharacter] = useState('KIADIMUNDI');
  const [relic, setRelic] = useState('7');
  const [selectedAlly, setSelectedAlly] = useState('');

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
    setStatus('Lade Gilden-Webseite...');
    try {
      // Akzeptiert sowohl die ID als auch den kompletten SWGOH.GG Link
      let idToUse = guildId.trim();
      if (idToUse.includes('/g/')) {
        const parts = idToUse.split('/g/');
        idToUse = parts[1].split('/')[0];
      }

      const swgohUrl = `https://swgoh.gg/g/${idToUse}/`;
      const proxiedUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(swgohUrl);
      
      const res = await fetch(proxiedUrl);
      if (!res.ok) {
        setStatus(`Fehler: Website antwortet mit Status ${res.status}`);
        return;
      }
      
      const html = await res.text();
      
      // HTML parsen und Spieler-Links suchen
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a[href^="/p/"]');
      
      const extractedMembers: {ally_code: string, name: string}[] = [];
      
      links.forEach(link => {
        const match = link.getAttribute('href')?.match(/\/p\/(\d{9})/);
        const name = link.textContent?.trim();
        
        // Vermeide leere Links oder Bilder-Links
        if (match && match[1] && name && name.length > 0) {
          extractedMembers.push({
             ally_code: match[1],
             name: name // 'name' wird vom Backend erwartet
          });
        }
      });

      // Duplikate filtern, falls Spieler auf der Seite mehrfach verlinkt sind
      const uniqueMembers = Array.from(new Map(extractedMembers.map(item => [item.ally_code, item])).values());

      if (uniqueMembers.length === 0) {
        setStatus('Webseite geladen, aber keine Spieler gefunden. Prüfe den Link.');
        return;
      }

      setStatus(`${uniqueMembers.length} Spieler extrahiert. Speichere in Datenbank...`);

      // Liste an das Vercel-Backend senden
      const backendRes = await fetch('/api/sync-guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: idToUse, members: uniqueMembers })
      });
      
      const data = await backendRes.json();
      setStatus(backendRes.ok ? data.message : `Datenbank-Fehler: ${data.error}`);
      
      if (backendRes.ok) fetchMembers();
    } catch (error) {
      setStatus('Netzwerkfehler beim Abruf der Daten.');
    }
  };

  const submitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase, zone, character_base_id: character, target_relic: parseInt(relic), assigned_ally_code: selectedAlly
        })
      });
      const data = await res.json();
      alert(res.ok ? data.message : `Fehler: ${data.error}`);
    } catch (error) {
      alert('Verbindungsfehler zur Datenbank');
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px' }}>
      <h1>Gilden-Manager</h1>
      
      <section style={{ marginBottom: '2rem', padding: '1rem', background: '#e9ecef', borderRadius: '8px' }}>
        <h2>1. Gilde synchronisieren</h2>
        <input
          type="text"
          placeholder="Kompletter SWGOH.GG Gilden-Link"
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          style={{ padding: '0.5rem', marginRight: '0.5rem', width: '70%' }}
        />
        <button onClick={syncGuild} style={{ padding: '0.5rem 1rem' }}>Abrufen</button>
        <p style={{ fontSize: '0.9rem', color: '#555', marginTop: '10px' }}>{status}</p>
      </section>

      <section style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>2. TB-Zuweisung erstellen</h2>
        <form onSubmit={submitAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ width: '50%' }}>Phase:<br/><input value={phase} onChange={e => setPhase(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} /></label>
            <label style={{ width: '50%' }}>Zone:<br/><input value={zone} onChange={e => setZone(e.target.value)} style={{ padding: '0.5rem', width: '100%' }} /></label>
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

          <button type="submit" style={{ padding: '0.5rem 1rem', background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer', marginTop: '10px' }}>
            Zuweisung speichern
          </button>
        </form>
      </section>

    </main>
  );
}