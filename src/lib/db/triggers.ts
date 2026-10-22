/**
 * Rules Drizzle can't express, kept as plain SQL. `drizzle-kit push` doesn't manage triggers, so
 * every database that gets the schema also runs this: the test and e2e setup do it after the push,
 * and production runs `pnpm db:triggers` (idempotent) with the schema changes of a release.
 */
export const TRIGGERS_SQL = /* sql */ `
-- A community that has an owner keeps at least one. The services check it first with a clear
-- message; this is the backstop for every other writer (two changes racing, a script, SQL by hand).
-- Deferred to the commit, so swapping owners inside one transaction works. Skipped when the row
-- goes because the community or the person's account is being deleted.
CREATE OR REPLACE FUNCTION community_keeps_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM communities WHERE id = OLD."communityId" FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM "user" WHERE id = OLD."userId") THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM community_members WHERE "communityId" = OLD."communityId" AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'last_owner' USING ERRCODE = 'check_violation', CONSTRAINT = 'community_keeps_owner';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS community_keeps_owner ON community_members;
CREATE CONSTRAINT TRIGGER community_keeps_owner
  AFTER UPDATE OF role, "communityId" OR DELETE ON community_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.role = 'owner')
  EXECUTE FUNCTION community_keeps_owner();
`;
