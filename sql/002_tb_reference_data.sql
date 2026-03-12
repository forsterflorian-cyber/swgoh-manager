-- sql/002_tb_reference_data.sql
-- Incremental schema update for DB-backed Territory Battle reference data.

ALTER TABLE tb_definitions
  ADD COLUMN IF NOT EXISTS tb_key VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE tb_definitions
SET tb_key = CASE
  WHEN lower(short_code) = 'rote' THEN 'rote'
  ELSE lower(short_code)
END
WHERE tb_key IS NULL;

UPDATE tb_definitions
SET source = COALESCE(source, 'manual')
WHERE source IS NULL;

ALTER TABLE tb_definitions
  ALTER COLUMN tb_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_definitions_tb_key ON tb_definitions(tb_key);

CREATE TABLE IF NOT EXISTS tb_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_definition_id UUID NOT NULL REFERENCES tb_definitions(id) ON DELETE CASCADE,
    phase_number INT NOT NULL CHECK (phase_number >= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tb_definition_id, phase_number)
);

CREATE INDEX IF NOT EXISTS idx_tb_phases_definition ON tb_phases(tb_definition_id);

CREATE TABLE IF NOT EXISTS tb_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_phase_id UUID NOT NULL REFERENCES tb_phases(id) ON DELETE CASCADE,
    zone_key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tb_phase_id, zone_key)
);

CREATE INDEX IF NOT EXISTS idx_tb_zones_phase ON tb_zones(tb_phase_id);

CREATE TABLE IF NOT EXISTS tb_platoons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_zone_id UUID NOT NULL REFERENCES tb_zones(id) ON DELETE CASCADE,
    platoon_key VARCHAR(120) NOT NULL,
    platoon_number INT NOT NULL CHECK (platoon_number >= 1),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tb_zone_id, platoon_key),
    UNIQUE(tb_zone_id, platoon_number)
);

CREATE INDEX IF NOT EXISTS idx_tb_platoons_zone ON tb_platoons(tb_zone_id);

CREATE TABLE IF NOT EXISTS tb_platoon_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_platoon_id UUID NOT NULL REFERENCES tb_platoons(id) ON DELETE CASCADE,
    slot_key VARCHAR(150) NOT NULL,
    slot_number INT NOT NULL CHECK (slot_number >= 1),
    unit_base_id VARCHAR(100) NOT NULL,
    unit_name VARCHAR(255),
    required_rarity INT,
    required_relic_tier INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tb_platoon_id, slot_key),
    UNIQUE(tb_platoon_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_tb_platoon_slots_platoon ON tb_platoon_slots(tb_platoon_id);
CREATE INDEX IF NOT EXISTS idx_tb_platoon_slots_unit ON tb_platoon_slots(unit_base_id);

CREATE TABLE IF NOT EXISTS tb_reference_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name VARCHAR(255) NOT NULL UNIQUE,
    source_version TEXT,
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    imported_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE tb_assignments
  ADD COLUMN IF NOT EXISTS tb_platoon_slot_id UUID REFERENCES tb_platoon_slots(id) ON DELETE CASCADE;

ALTER TABLE tb_assignments
  ALTER COLUMN tb_requirement_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_assignments_instance_slot_unique
ON tb_assignments(tb_instance_id, tb_platoon_slot_id)
WHERE tb_platoon_slot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tb_assignments_slot
ON tb_assignments(tb_platoon_slot_id)
WHERE tb_platoon_slot_id IS NOT NULL;
