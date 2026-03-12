-- sql/004_guild_upgrade_assignments.sql
-- Strategic guild-level build targets for future platoon readiness.

CREATE TABLE IF NOT EXISTS guild_upgrade_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  guild_member_id UUID NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  unit_base_id VARCHAR(100) NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT guild_upgrade_assignments_unique_member_unit
    UNIQUE (guild_id, guild_member_id, unit_base_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_upgrade_assignments_guild_unit
ON guild_upgrade_assignments(guild_id, unit_base_id);

CREATE INDEX IF NOT EXISTS idx_guild_upgrade_assignments_guild_member
ON guild_upgrade_assignments(guild_id, guild_member_id);
