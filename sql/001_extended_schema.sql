-- migrations/001_extended_schema.sql

-- ============================================
-- GUILDS
-- ============================================
CREATE TABLE IF NOT EXISTS guilds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    swgoh_gg_id VARCHAR(50) UNIQUE,
    owner_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_guilds_slug ON guilds(slug);
CREATE INDEX idx_guilds_owner ON guilds(owner_id);

-- ============================================
-- USERS (NextAuth compatible)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    email_verified TIMESTAMP WITH TIME ZONE,
    image TEXT,
    ally_code VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at BIGINT,
    token_type VARCHAR(50),
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMP WITH TIME ZONE NOT NULL
);

-- ============================================
-- PERMISSIONS / ROLES
-- ============================================
CREATE TYPE guild_role AS ENUM ('owner', 'admin', 'officer', 'member');

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    role guild_role NOT NULL DEFAULT 'member',
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, guild_id)
);

CREATE INDEX idx_permissions_guild ON permissions(guild_id);
CREATE INDEX idx_permissions_user ON permissions(user_id);

-- ============================================
-- GUILD MEMBERS (scraped from swgoh.gg)
-- ============================================
CREATE TABLE IF NOT EXISTS guild_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    player_name VARCHAR(255) NOT NULL,
    ally_code VARCHAR(20) NOT NULL,
    galactic_power BIGINT DEFAULT 0,
    linked_user_id UUID REFERENCES users(id),
    last_synced TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, ally_code)
);

CREATE INDEX idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX idx_guild_members_ally ON guild_members(ally_code);

-- ============================================
-- ROSTER CACHE (Character data per player)
-- ============================================
CREATE TABLE IF NOT EXISTS roster_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ally_code VARCHAR(20) NOT NULL,
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    unit_base_id VARCHAR(100) NOT NULL,       -- z.B. "GRANDMASTERLUKE"
    unit_name VARCHAR(255) NOT NULL,           -- z.B. "Jedi Master Luke Skywalker"
    rarity INT DEFAULT 0,                      -- Sterne (1-7)
    gear_level INT DEFAULT 0,                  -- Gear (1-13)
    relic_tier INT DEFAULT 0,                  -- Relic (0-9)
    galactic_power INT DEFAULT 0,
    is_galactic_legend BOOLEAN DEFAULT FALSE,
    zeta_count INT DEFAULT 0,
    omicron_count INT DEFAULT 0,
    speed INT DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ally_code, unit_base_id)
);

CREATE INDEX idx_roster_ally ON roster_cache(ally_code);
CREATE INDEX idx_roster_unit ON roster_cache(unit_base_id);
CREATE INDEX idx_roster_guild ON roster_cache(guild_id);
CREATE INDEX idx_roster_relic ON roster_cache(unit_base_id, relic_tier);
CREATE INDEX idx_roster_composite ON roster_cache(guild_id, unit_base_id, relic_tier);

-- ============================================
-- TB DEFINITIONS (Which TBs exist)
-- ============================================
CREATE TABLE IF NOT EXISTS tb_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,                -- "Rise of the Empire"
    short_code VARCHAR(50) NOT NULL UNIQUE,    -- "ROTE"
    alignment VARCHAR(20),                     -- "mixed", "light", "dark"
    total_phases INT DEFAULT 6,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TB REQUIREMENTS (Master Data)
-- ============================================
CREATE TABLE IF NOT EXISTS tb_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_definition_id UUID NOT NULL REFERENCES tb_definitions(id) ON DELETE CASCADE,
    phase INT NOT NULL CHECK (phase >= 1 AND phase <= 6),
    zone_name VARCHAR(255) NOT NULL,           -- "Zeffo - Republic"
    zone_code VARCHAR(100) NOT NULL,           -- "P4_ZEFFO_REP"
    platoon_position INT,                      -- Position innerhalb der Platoon (1-15)
    unit_base_id VARCHAR(100) NOT NULL,        -- "YOURUNITID"
    unit_name VARCHAR(255) NOT NULL,           -- Anzeigename
    min_rarity INT DEFAULT 7,
    min_relic INT DEFAULT 0,                   -- Mindest-Relic
    total_needed INT DEFAULT 1,                -- Wie oft wird die Unit benötigt?
    is_combat_mission BOOLEAN DEFAULT FALSE,
    is_platoon BOOLEAN DEFAULT TRUE,
    special_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tb_req_definition ON tb_requirements(tb_definition_id);
CREATE INDEX idx_tb_req_phase ON tb_requirements(tb_definition_id, phase);
CREATE INDEX idx_tb_req_zone ON tb_requirements(tb_definition_id, phase, zone_code);
CREATE INDEX idx_tb_req_unit ON tb_requirements(unit_base_id);

-- ============================================
-- TB INSTANCES (An actual TB run of a guild)
-- ============================================
CREATE TABLE IF NOT EXISTS tb_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    tb_definition_id UUID NOT NULL REFERENCES tb_definitions(id),
    name VARCHAR(255),                         -- "ROTE Run #14 - June 2025"
    status VARCHAR(20) DEFAULT 'planning',     -- planning, active, completed
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tb_instances_guild ON tb_instances(guild_id);

-- ============================================
-- TB ASSIGNMENTS (Zuweisungen)
-- ============================================
CREATE TABLE IF NOT EXISTS tb_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_instance_id UUID NOT NULL REFERENCES tb_instances(id) ON DELETE CASCADE,
    tb_requirement_id UUID NOT NULL REFERENCES tb_requirements(id) ON DELETE CASCADE,
    guild_member_id UUID NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
    ally_code VARCHAR(20) NOT NULL,
    unit_base_id VARCHAR(100) NOT NULL,
    assigned_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'assigned',     -- assigned, confirmed, completed, failed
    player_relic_at_assignment INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tb_instance_id, tb_requirement_id, guild_member_id)
);

CREATE INDEX idx_assignments_instance ON tb_assignments(tb_instance_id);
CREATE INDEX idx_assignments_member ON tb_assignments(guild_member_id);
CREATE INDEX idx_assignments_requirement ON tb_assignments(tb_requirement_id);

-- ============================================
-- SEED: TB Definitions
-- ============================================
INSERT INTO tb_definitions (name, short_code, alignment, total_phases, is_active) VALUES
('Rise of the Empire', 'ROTE', 'mixed', 6, true),
('Republic Offensive', 'LSTB_GEONOSIS', 'light', 4, true),
('Separatist Might', 'DSTB_GEONOSIS', 'dark', 4, true)
ON CONFLICT (short_code) DO NOTHING;

-- ============================================
-- SEED: Example ROTE Requirements (Phase 4 Zeffo)
-- ============================================
-- This would normally be a massive data load
INSERT INTO tb_requirements (tb_definition_id, phase, zone_name, zone_code, platoon_position, unit_base_id, unit_name, min_rarity, min_relic, total_needed, is_platoon)
SELECT
    td.id, 4, 'Zeffo - Republic Operations', 'P4_ZEFFO_REP', pos.n,
    unit.base_id, unit.name, 7, unit.relic, 1, true
FROM tb_definitions td
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15)) AS pos(n)
CROSS JOIN (VALUES
    ('YOURUNITID_MUNDI',       'Ki-Adi-Mundi',              7),
    ('YOURUNITID_CONSULAR',    'Jedi Consular',              5),
    ('YOURUNITID_SHAAKTI',     'Shaak Ti',                   7),
    ('YOURUNITID_AAYLA',       'Aayla Secura',               5),
    ('YOURUNITID_CLONESERGEANT','Clone Sergeant - Phase I',  5)
) AS unit(base_id, name, relic)
WHERE td.short_code = 'ROTE'
  AND pos.n <= 3  -- Nur als Beispiel: 3 Platoon-Slots
ON CONFLICT DO NOTHING;