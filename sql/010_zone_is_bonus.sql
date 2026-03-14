-- Migration 010: add is_bonus column to tb_zones
-- Bonus zones (e.g. Kashyyyk) have no C{n} conflict number in the operations data.
-- Previously they were silently skipped during import; this column lets us track and
-- display them as a distinct group in the phase UI.

ALTER TABLE tb_zones
  ADD COLUMN IF NOT EXISTS is_bonus BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: any zone whose key contains '-bonus-' is a bonus zone.
-- (Regular zones use the pattern rote-p{n}-c{n}; bonus zones will use
--  rote-p{n}-bonus-{operationId} after the next import run.)
-- This UPDATE is a no-op on a fresh DB; it corrects any rows written by a
-- future import before this migration is applied.
UPDATE tb_zones
SET is_bonus = true
WHERE zone_key LIKE '%-bonus-%';
