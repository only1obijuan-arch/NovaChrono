-- Gate 2B: remove only the confirmed equivalent production index, last.
DO $$
DECLARE
  kept_oid OID := to_regclass('public.idx_matches_league_id');
  redundant_oid OID := to_regclass('public.matches_league_idx');
  kept_shape RECORD;
  redundant_shape RECORD;
BEGIN
  IF kept_oid IS NULL OR redundant_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT indisunique, indisprimary, indisvalid, indkey, indcollation,
         indclass, indoption, indexprs, indpred
    INTO kept_shape
  FROM pg_index WHERE indexrelid = kept_oid;

  SELECT indisunique, indisprimary, indisvalid, indkey, indcollation,
         indclass, indoption, indexprs, indpred
    INTO redundant_shape
  FROM pg_index WHERE indexrelid = redundant_oid;

  IF kept_shape IS DISTINCT FROM redundant_shape THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: matches league indexes are no longer equivalent';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conindid IN (kept_oid, redundant_oid))
     OR EXISTS (
       SELECT 1 FROM pg_depend
       WHERE refobjid IN (kept_oid, redundant_oid)
         AND deptype NOT IN ('a', 'i')
     ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: a matches league index has a preservation dependency';
  END IF;

  DROP INDEX matches_league_idx;
END
$$;
