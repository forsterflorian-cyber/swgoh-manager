-- 008_player_roster_verify.sql
--
-- Prüft ob die player_roster Tabelle existiert und erstellt sie falls nicht.

-- Prüfe ob die Tabelle existiert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'player_roster'
  ) THEN
    RAISE NOTICE 'Tabelle player_roster existiert nicht - wird erstellt...';
    
    -- Erstelle die Tabelle
    CREATE TABLE player_roster (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id     UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      player_id    VARCHAR(50)  NOT NULL,
      unit_base_id VARCHAR(100) NOT NULL,
      rarity       SMALLINT     NOT NULL DEFAULT 0,   -- stars 1-7
      level        SMALLINT     NOT NULL DEFAULT 1,   -- character level 1-85
      gear_level   SMALLINT     NOT NULL DEFAULT 1,   -- gear tier 1-13
      relic_tier   SMALLINT     NOT NULL DEFAULT 0,   -- relic 0-9 (0 = no relic)
      last_synced  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

      CONSTRAINT uq_player_roster UNIQUE (guild_id, player_id, unit_base_id)
    );

    -- Erstelle Indizes
    CREATE INDEX idx_player_roster_player
      ON player_roster (guild_id, player_id);

    CREATE INDEX idx_player_roster_unit
      ON player_roster (guild_id, unit_base_id);

    CREATE INDEX idx_player_roster_unit_relic
      ON player_roster (guild_id, unit_base_id, relic_tier);

    RAISE NOTICE 'Tabelle player_roster erfolgreich erstellt!';
  ELSE
    RAISE NOTICE 'Tabelle player_roster existiert bereits.';
  END IF;
END $$;

-- Zeige Tabellenstruktur an
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'player_roster'
ORDER BY ordinal_position;

-- Zeige Anzahl der Zeilen
SELECT COUNT(*) AS total_rows FROM player_roster;