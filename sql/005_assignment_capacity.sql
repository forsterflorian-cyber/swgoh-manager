-- sql/005_assignment_capacity.sql
-- Add optional planet category tracking for strategic assignments and capacity lookups.

ALTER TABLE guild_upgrade_assignments
ADD COLUMN IF NOT EXISTS planet_category TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guild_upgrade_assignments_planet_category_check'
  ) THEN
    ALTER TABLE guild_upgrade_assignments
    ADD CONSTRAINT guild_upgrade_assignments_planet_category_check
    CHECK (
      planet_category IS NULL
      OR planet_category IN ('LS', 'DS', 'MIX', 'SPECIAL')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_guild_upgrade_assignments_guild_member_planet_category
ON guild_upgrade_assignments(guild_id, guild_member_id, planet_category);
