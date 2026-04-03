CREATE TABLE registered_members (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id          UUID        NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  discord_user_id   TEXT        NOT NULL,
  ally_code         TEXT        NOT NULL,
  guild_member_id   UUID        NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  status            TEXT        NOT NULL DEFAULT 'active',
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT registered_members_guild_discord_unique UNIQUE (guild_id, discord_user_id),
  CONSTRAINT registered_members_guild_ally_unique    UNIQUE (guild_id, ally_code)
);

CREATE INDEX idx_registered_members_guild_id ON registered_members(guild_id);
