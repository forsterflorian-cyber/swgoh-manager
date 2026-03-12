# SWGOH Manager

SWGOH Manager is a Next.js app for planning Territory Battle platoon assignments for a guild.

The project keeps live guild state separate from Territory Battle reference data:

- Dynamic guild and roster data come from `swgoh.gg`
- Territory Battle reference data come from `swgoh-utils/gamedata`
- The browser reads only from this app's own API and Postgres tables

## Data Sources

### Dynamic data

Source: `swgoh.gg`

- guild members
- player roster ownership
- relic and rarity state

### Reference data

Source: `swgoh-utils/gamedata`

- `allVersions.json`
- `territoryBattleDefinition.json`
- `swgoh_rote_operations.json`

The importer checks `allVersions.json` first and only fetches the large Territory Battle files when the stored source version changed or when the import is forced.

## Architecture

### Reference data flow

1. Server-side importer fetches the upstream JSON files
2. Upstream payloads are parsed defensively
3. ROTE data are normalized into stable internal shapes
4. Normalized records are written into Postgres tables:
   - `tb_definitions`
   - `tb_phases`
   - `tb_zones`
   - `tb_platoons`
   - `tb_platoon_slots`
   - `tb_reference_versions`
5. Runtime gap analysis and assignment APIs read only from the database

### Guild state flow

1. Guild members are synced from `swgoh.gg`
2. Player rosters are cached in `roster_cache`
3. Gap analysis combines guild roster state with internal TB slot definitions
4. Assignments are stored against internal TB slot ids

## Environment Variables

### Required for app runtime

- `POSTGRES_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`

### Recommended for local Prisma/tooling consistency

- `DATABASE_URL`
- `DIRECT_URL`

### Optional but required for the protected admin import route

- `TB_IMPORT_ADMIN_SECRET`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Set the required environment variables in `.env.local`

3. Apply SQL manually in Neon

For a fresh database, run these files in order:

1. `sql/001_extended_schema.sql`
2. `sql/002_tb_reference_data.sql`
3. `sql/003_stability_indexes.sql`

If your Neon database already has the original schema applied, run only:

1. `sql/002_tb_reference_data.sql`
2. `sql/003_stability_indexes.sql`

4. Import the current ROTE reference data:

```bash
npm run import:tb -- --tb rote
```

To force a refresh even when versions did not change:

```bash
npm run import:tb -- --tb rote --force
```

5. Start the development server:

```bash
npm run dev
```

## Manual Neon SQL Instructions

Use the Neon SQL editor and run the files in this order:

1. Open `sql/001_extended_schema.sql`
2. Paste the file contents into the Neon SQL editor and run it
3. Open `sql/002_tb_reference_data.sql`
4. Paste the file contents into the Neon SQL editor and run it
5. Open `sql/003_stability_indexes.sql`
6. Paste the file contents into the Neon SQL editor and run it

If you want to print the exact SQL locally before pasting it into Neon, use:

```powershell
Get-Content .\sql\001_extended_schema.sql -Raw
Get-Content .\sql\002_tb_reference_data.sql -Raw
Get-Content .\sql\003_stability_indexes.sql -Raw
```

## TB Reference Import

### CLI import

```bash
npm run import:tb -- --tb rote
```

The script:

- checks stored source versions in Postgres
- skips cleanly when the version is unchanged unless `--force` is used
- fails before writing when GitHub is unavailable or upstream payloads are empty/invalid
- normalizes ROTE phases, zones, platoons, and slots
- upserts the normalized data into Postgres
- prints source versions and counts
- exits non-zero on failure

### Protected admin route

Endpoint:

- `POST /api/admin/tb-reference/import`

Required environment variable:

- `TB_IMPORT_ADMIN_SECRET`

Preferred authentication header:

- `Authorization: Bearer <TB_IMPORT_ADMIN_SECRET>`

Alternative header:

- `x-admin-secret: <TB_IMPORT_ADMIN_SECRET>`

Example body:

```json
{
  "tb": "rote",
  "force": false
}
```

Example `curl`:

```bash
curl -X POST http://localhost:3000/api/admin/tb-reference/import \
  -H "Authorization: Bearer $TB_IMPORT_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tb":"rote","force":true}'
```

The route is intended for occasional protected admin use only. It is not a public import endpoint.

## Vercel Deployment Notes

- The app is compatible with Vercel server-side execution
- API routes that touch Postgres or upstream sync sources run on the Node.js runtime
- The importer runs server-side only
- The browser never fetches GitHub raw JSON directly
- The admin import route must be protected with `TB_IMPORT_ADMIN_SECRET`
- `NEXTAUTH_URL` should be set in production, and `VERCEL_URL` is used as the fallback base URL for server-side public-page fetches
- Configure the same database env vars in Vercel that you use locally
- After deploying schema changes, run the manual TB reference import once before using ROTE planning screens

## Runtime Notes

- Gap analysis uses only DB-backed platoon slot reference data
- Assignments are stored against internal slot ids in `tb_assignments.tb_platoon_slot_id`
- Planner APIs require an authenticated user with access to the guild that owns the TB instance
- Public guild views and planner pages read from the normalized TB tables, not from upstream JSON

## Verification Commands

Install:

```bash
npm install
```

Lint:

```bash
npm run lint
```

Run the importer:

```bash
npm run import:tb -- --tb rote
```

Start local dev:

```bash
npm run dev
```
