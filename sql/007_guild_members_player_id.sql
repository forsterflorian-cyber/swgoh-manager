-- 007_guild_members_player_id.sql
--
-- Adds player_id as the stable identity key for guild members.
--
-- Background:
--   The Comlink /guild endpoint returns playerId, not allyCode.
--   allyCode is only available via a separate /player call.
--   The unique constraint must therefore be on (guild_id, player_id),
--   and ally_code becomes a regular nullable column.

-- 1. Add player_id column (nullable; populated on next sync)
ALTER TABLE guild_members
  ADD COLUMN IF NOT EXISTS player_id VARCHAR(50);

-- 2. Drop the old unique constraint that relied on ally_code
--    Default PostgreSQL name for UNIQUE(guild_id, ally_code).
ALTER TABLE guild_members
  DROP CONSTRAINT IF EXISTS guild_members_guild_id_ally_code_key;

-- 3. Allow ally_code to be null (it arrives from a separate /player fetch)
ALTER TABLE guild_members
  ALTER COLUMN ally_code DROP NOT NULL;

-- 4. Add new unique constraint on (guild_id, player_id).
--    Rows where player_id IS NULL do not conflict (PostgreSQL treats NULLs as distinct).
ALTER TABLE guild_members
  ADD CONSTRAINT guild_members_guild_id_player_id_key
  UNIQUE (guild_id, player_id);

-- 5. Index for player_id lookups
CREATE INDEX IF NOT EXISTS idx_guild_members_player_id
  ON guild_members (player_id);
