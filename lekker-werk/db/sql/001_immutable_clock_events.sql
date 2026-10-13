-- Run once after the schema exists (psql -d lekkerwerk -f db/sql/001_immutable_clock_events.sql).
-- clock_events is an append-only ledger: corrections are new rows, never edits.
CREATE OR REPLACE FUNCTION forbid_clock_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'clock_events is immutable (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clock_events_immutable ON clock_events;
CREATE TRIGGER clock_events_immutable
  BEFORE UPDATE OR DELETE ON clock_events
  FOR EACH ROW EXECUTE FUNCTION forbid_clock_event_mutation();
