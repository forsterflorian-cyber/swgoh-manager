-- 008_player_roster.sql
--
-- Creates the player_roster table: Comlink-sourced unit ownership per guild member.
--
-- Keyed by (guild_id, player_id, unit_base_id) for stable, idempotent upserts.
-- This table is the DB foundation for future strategic TB matching.
--
-- Distinct from roster_cache (which is swgoh.gg-sourced and keyed by ally_code).
-- player_roster is the authoritative Comlink-driven store going forward.

CREATE TABLE IF NOT EXISTS player_roster (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id     UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id    VARCHAR(50)  NOT NULL,
  unit_base_id VARCHAR(100) NOT NULL,
  rarity       SMALLINT     NOT NULL DEFAULT 0,   -- stars 1-7
  level        SMALLINT     NOT NULL DEFAULT 1,   -- character level 1-85
  gear_level   SMALLINT     NOT NULL DEFAULT 1,   -- gear tier 1-13
  relic_tier   SMALLINT     NOT NULL DEFAULT 0,   -- relic 0-9 (0 = no relic)
  last_synced  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT uq_player_roster UNIQUE (guild_id, player_id, unit_base_id)
);

-- Lookup: all units owned by a specific player in a guild
CREATE INDEX idx_player_roster_player
  ON player_roster (guild_id, player_id);

-- Lookup: who in a guild owns a specific unit (strategic matching)
CREATE INDEX idx_player_roster_unit
  ON player_roster (guild_id, unit_base_id);

-- Lookup: units at relic tier or above across a guild (platoon eligibility)
CREATE INDEX idx_player_roster_unit_relic
  ON player_roster (guild_id, unit_base_id, relic_tier);
