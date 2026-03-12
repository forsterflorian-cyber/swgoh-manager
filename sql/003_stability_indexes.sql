-- sql/003_stability_indexes.sql
-- Additional safety and performance changes for stabilized TB planning/runtime queries.

ALTER TABLE roster_cache
  DROP CONSTRAINT IF EXISTS roster_cache_ally_code_unit_base_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'roster_cache_guild_ally_code_unit_base_id_key'
  ) THEN
    ALTER TABLE roster_cache
      ADD CONSTRAINT roster_cache_guild_ally_code_unit_base_id_key
      UNIQUE (guild_id, ally_code, unit_base_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_roster_cache_guild_ally_unit
ON roster_cache(guild_id, ally_code, unit_base_id);

CREATE INDEX IF NOT EXISTS idx_tb_zones_phase_sort
ON tb_zones(tb_phase_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_tb_platoons_zone_sort
ON tb_platoons(tb_zone_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_tb_assignments_instance_ally_unit
ON tb_assignments(tb_instance_id, ally_code, unit_base_id);

CREATE INDEX IF NOT EXISTS idx_tb_instances_guild_status_created
ON tb_instances(guild_id, status, created_at DESC);
