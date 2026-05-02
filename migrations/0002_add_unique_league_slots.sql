-- Migration 0002: add UNIQUE(league_id, slot_number) to league_slots
-- Safe to re-run: DO block skips if the constraint already exists.

-- Remove duplicate (league_id, slot_number) pairs before applying the constraint,
-- keeping the row with the smallest id in each group. No-op when no duplicates exist.
DELETE FROM league_slots
WHERE id NOT IN (
  SELECT DISTINCT ON (league_id, slot_number) id
  FROM league_slots
  ORDER BY league_id, slot_number, id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'league_slots_unique_slot'
      AND conrelid = 'league_slots'::regclass
  ) THEN
    ALTER TABLE league_slots
      ADD CONSTRAINT league_slots_unique_slot
      UNIQUE (league_id, slot_number);
  END IF;
END
$$;
