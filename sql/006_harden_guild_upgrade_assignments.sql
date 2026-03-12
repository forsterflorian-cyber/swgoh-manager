-- sql/006_harden_guild_upgrade_assignments.sql
-- Strategic target assignments use a single active-row lifecycle:
-- one row is the live assignment, writes update that row in place, and deletes remove it.

UPDATE guild_upgrade_assignments
SET
  unit_base_id = BTRIM(unit_base_id),
  note = NULLIF(BTRIM(note), ''),
  created_at = COALESCE(created_at, updated_at, NOW()),
  updated_at = COALESCE(updated_at, created_at, NOW());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM guild_upgrade_assignments gua
    JOIN guild_members gm ON gm.id = gua.guild_member_id
    WHERE gua.guild_id <> gm.guild_id
  ) THEN
    RAISE EXCEPTION
      'guild_upgrade_assignments contains rows whose guild_id does not match guild_members.guild_id';
  END IF;
END $$;

ALTER TABLE guild_upgrade_assignments
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guild_upgrade_assignments_unit_base_id_check'
  ) THEN
    ALTER TABLE guild_upgrade_assignments
      ADD CONSTRAINT guild_upgrade_assignments_unit_base_id_check
      CHECK (
        unit_base_id = BTRIM(unit_base_id)
        AND char_length(unit_base_id) > 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guild_upgrade_assignments_note_check'
  ) THEN
    ALTER TABLE guild_upgrade_assignments
      ADD CONSTRAINT guild_upgrade_assignments_note_check
      CHECK (
        note IS NULL
        OR (
          note = BTRIM(note)
          AND char_length(note) > 0
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guild_members_id_guild_id_unique'
  ) THEN
    ALTER TABLE guild_members
      ADD CONSTRAINT guild_members_id_guild_id_unique
      UNIQUE (id, guild_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guild_upgrade_assignments_guild_member_scope_fkey'
  ) THEN
    ALTER TABLE guild_upgrade_assignments
      ADD CONSTRAINT guild_upgrade_assignments_guild_member_scope_fkey
      FOREIGN KEY (guild_member_id, guild_id)
      REFERENCES guild_members(id, guild_id)
      ON DELETE CASCADE;
  END IF;
END $$;
