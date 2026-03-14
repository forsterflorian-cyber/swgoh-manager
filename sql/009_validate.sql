-- Validation queries for migration 009 (lock_type column)
-- Run these against the Neon DB after applying 009_assignment_lock_type.sql
-- to confirm the migration landed correctly.

-- 1. Confirm the column exists with the correct default.
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'tb_assignments'
  AND column_name = 'lock_type';
-- Expected: column_name=lock_type, data_type=text, column_default='FLEX'::text, is_nullable=NO

-- 2. Distribution of lock_type values across all existing assignments.
--    All rows created before the migration will be 'LOCKED' (migration default was LOCKED).
--    Rows written after the migration by auto-assign will be 'FLEX'.
SELECT lock_type, COUNT(*) AS assignment_count
FROM tb_assignments
GROUP BY lock_type
ORDER BY lock_type;

-- 3. Sanity-check: no NULL values allowed.
SELECT COUNT(*) AS null_count
FROM tb_assignments
WHERE lock_type IS NULL;
-- Expected: 0

-- 4. Spot-check: verify that auto-assigned rows have lock_type = 'FLEX'.
--    (Only meaningful after running auto-assign at least once post-migration.)
SELECT ta.id, ta.lock_type, gm.player_name, ta.unit_base_id, ta.created_at
FROM tb_assignments ta
JOIN guild_members gm ON gm.id = ta.guild_member_id
ORDER BY ta.created_at DESC
LIMIT 20;

-- 5. Per-zone capacity check: flag any member with more than 10 assignments in one zone.
--    Should return 0 rows in a correctly managed instance.
SELECT
  ta.tb_instance_id,
  tz.zone_key,
  ta.guild_member_id,
  gm.player_name,
  COUNT(*) AS zone_assignment_count
FROM tb_assignments ta
JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
JOIN guild_members gm ON gm.id = ta.guild_member_id
GROUP BY ta.tb_instance_id, tz.zone_key, ta.guild_member_id, gm.player_name
HAVING COUNT(*) > 10
ORDER BY zone_assignment_count DESC;
-- Expected: 0 rows
