-- Migration 009: Add lock_type to tb_assignments
--
-- LOCKED = set by a manual officer assignment; never moved by rebalancing.
-- FLEX   = set by auto-assign / recompute; may be replaced during rebalancing.
--
-- Existing rows cannot be distinguished as manual vs auto.
-- Default them to LOCKED so that officers keep control: anything already
-- committed stays fixed until they explicitly clear or re-run auto-assign.

ALTER TABLE tb_assignments
  ADD COLUMN IF NOT EXISTS lock_type TEXT NOT NULL DEFAULT 'LOCKED';

-- Future auto-assigned rows default to FLEX; the application sets LOCKED
-- explicitly for manual assignments.
ALTER TABLE tb_assignments
  ALTER COLUMN lock_type SET DEFAULT 'FLEX';
