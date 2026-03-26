# Externer Cron-Service Setup

Da Vercel Cron-Jobs nur auf bezahlten Plänen verfügbar sind, empfehle ich die Verwendung eines externen Cron-Services.

## Option 1: cron-job.org (Kostenlos)

### Schritt 1: Account erstellen
1. Gehe zu https://cron-job.org
2. Klicke auf "Sign Up" und erstelle einen kostenlosen Account
3. Bestätige deine E-Mail-Adresse

### Schritt 2: Cron-Job erstellen
1. Logge dich ein und klicke auf "Create cronjob"
2. Fülle die folgenden Felder aus:

   **Title:** `SWGOH Manager - Guild Roster Sync`
   
   **URL:** `https://swgoh-manager.vercel.app/api/cron/guild-sync`
   
   **Request method:** `POST`
   
   **Request headers:**
   ```
   Authorization: Bearer DEIN_CRON_SECRET
   Content-Type: application/json
   ```
   
   **Schedule:** 
   - Execution period: `Daily`
   - At time: `06:00`
   - Timezone: `Europe/Berlin` (oder deine Zeitzone)

3. Klicke auf "Create cronjob"

### Schritt 3: CRON_SECRET konfigurieren
Das `CRON_SECRET` muss in Vercel als Environment Variable gesetzt sein:
1. Gehe zu deinem Vercel Dashboard
2. Wähle dein Projekt aus
3. Gehe zu "Settings" → "Environment Variables"
4. Füge eine neue Variable hinzu:
   - **Name:** `CRON_SECRET`
   - **Value:** Ein zufälliger, sicherer String (z.B. generiert mit `openssl rand -hex 32`)
5. Kopiere diesen Wert und verwende ihn in der cron-job.org Konfiguration

## Option 2: EasyCron (Kostenlos mit Limiten)

### Schritt 1: Account erstellen
1. Gehe zu https://www.easycron.com
2. Registriere dich für einen kostenlosen Account

### Schritt 2: Cron-Job erstellen
1. Klicke auf "Add Cron Job"
2. Konfiguriere:

   **Cron Job Name:** `SWGOH Manager Guild Sync`
   
   **URL to execute:** `https://swgoh-manager.vercel.app/api/cron/guild-sync`
   
   **HTTP Method:** `POST`
   
   **HTTP Headers:**
   ```
   Authorization: Bearer DEIN_CRON_SECRET
   ```
   
   **Cron expression:** `0 6 * * *`
   
   **Timezone:** `Europe/Berlin`

3. Speichere den Job

## Option 3: GitHub Actions (Kostenlos)

Erstelle eine Datei `.github/workflows/guild-sync.yml`:

```yaml
name: Guild Roster Sync

on:
  schedule:
    # Täglich um 6:00 UTC
    - cron: '0 6 * * *'
  workflow_dispatch: # Ermöglicht manuelle Ausführung

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Guild Sync
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            https://swgoh-manager.vercel.app/api/cron/guild-sync
```

**Hinweis:** Du musst das `CRON_SECRET` in den GitHub Repository Secrets speichern:
1. Gehe zu deinem GitHub Repository
2. Settings → Secrets and variables → Actions
3. Klicke auf "New repository secret"
4. Name: `CRON_SECRET`
5. Value: Dein CRON_SECRET Wert

## Testen des Cron-Jobs

Nach der Einrichtung kannst du den Cron-Job manuell testen:

```powershell
# PowerShell
Invoke-RestMethod `
  -Method POST `
  -Uri "https://swgoh-manager.vercel.app/api/cron/guild-sync" `
  -Headers @{ "Authorization" = "Bearer DEIN_CRON_SECRET" } `
  -ContentType "application/json"
```

Oder mit curl:
```bash
curl -X POST \
  -H "Authorization: Bearer DEIN_CRON_SECRET" \
  -H "Content-Type: application/json" \
  https://swgoh-manager.vercel.app/api/cron/guild-sync
```

## Überprüfung der Logs

### Vercel Logs
1. Gehe zu deinem Vercel Dashboard
2. Wähle dein Projekt aus
3. Gehe zu "Logs"
4. Filtere nach `/api/cron/guild-sync`
5. Prüfe die Ausgaben auf Erfolg oder Fehler

### Erwartete Erfolgsmeldung
```json
{
  "success": true,
  "timestamp": "2026-03-23T06:00:00.000Z",
  "summary": {
    "totalGuilds": 1,
    "succeeded": 1,
    "failed": 0
  },
  "results": [...]
}
```

## Troubleshooting

### Fehler: "Unauthorized"
- Das `CRON_SECRET` in der Anfrage stimmt nicht mit dem in Vercel überein
- Prüfe die Environment Variables in Vercel

### Fehler: "Cron secret not configured"
- Das `CRON_SECRET` Environment Variable ist nicht in Vercel gesetzt
- Füge es in Vercel hinzu und redeploye

### Fehler: "Comlink service is waking up oder unavailable"
- Der Comlink-Service ist nicht erreichbar
- Prüfe die `COMLINK_URL` Environment Variable
- Der Service könnte gerade neugestartet werden

### Fehler: "player_roster table not found"
- Die Datenbank-Migration wurde nicht ausgeführt
- Führe `sql/008_player_roster_verify.sql` in Neon aus

### Keine Guilds zum Synchronisieren
- Prüfe ob Guilds einen Slug haben:
  ```sql
  SELECT id, name, slug FROM guild_settings WHERE slug IS NOT NULL AND slug != '';