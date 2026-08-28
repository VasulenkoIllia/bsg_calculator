-- Make an image-only rollback survivable.
--
-- 0020 added `documents_crm_note_pairing_check`: a row carrying a
-- hubspot_note_id MUST also carry crm_note_provider. New code always sets
-- both. Code from BEFORE 0020 sets only the note id -- it has never heard
-- of the provider column -- so if the deploy is rolled back by retagging
-- the previous image while the migrations stay applied (the documented,
-- and the natural, rollback), every note write starts failing with:
--
--   new row for relation "documents" violates check constraint
--   "documents_crm_note_pairing_check"
--
-- Verified against a copy of production, not reasoned about.
--
-- A column DEFAULT does not fix this: the note id is attached by UPDATE,
-- and defaults apply only to INSERT. Hence a trigger.
--
-- Labelling those writes 'hubspot' is not a guess. Code that predates the
-- provider column can only ever have written a HubSpot note; it has no
-- monday client to write anything else. The trigger therefore preserves
-- the invariant the CHECK exists to enforce ("a note id always says which
-- system it lives in") instead of weakening it.

CREATE OR REPLACE FUNCTION crm_note_provider_backfill() RETURNS trigger AS $$
BEGIN
  IF NEW.hubspot_note_id IS NOT NULL AND NEW.crm_note_provider IS NULL THEN
    NEW.crm_note_provider := 'hubspot';
  END IF;
  -- Clearing the note id must clear the marker too, or the row trips the
  -- other half of the CHECK. Old code nulls the id on teardown.
  IF NEW.hubspot_note_id IS NULL THEN
    NEW.crm_note_provider := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_crm_note_provider_backfill ON documents;
CREATE TRIGGER documents_crm_note_provider_backfill
  BEFORE INSERT OR UPDATE OF hubspot_note_id, crm_note_provider ON documents
  FOR EACH ROW EXECUTE FUNCTION crm_note_provider_backfill();

DROP TRIGGER IF EXISTS calculator_configs_crm_note_provider_backfill ON calculator_configs;
CREATE TRIGGER calculator_configs_crm_note_provider_backfill
  BEFORE INSERT OR UPDATE OF hubspot_note_id, crm_note_provider ON calculator_configs
  FOR EACH ROW EXECUTE FUNCTION crm_note_provider_backfill();
