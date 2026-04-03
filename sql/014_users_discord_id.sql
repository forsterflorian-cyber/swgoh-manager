-- 014_users_discord_id.sql
--
-- Adds discord_user_id to the users table.
-- This app uses NextAuth JWT strategy (no database adapter), so the accounts
-- table does not exist. The Discord snowflake is captured in the signIn
-- callback and stored here as the stable Discord identity for registered_members.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_user_id
  ON users (discord_user_id)
  WHERE discord_user_id IS NOT NULL;
