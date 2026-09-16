-- Signing in with an SFU computing ID, alongside Google and a password.
--
-- SFU publishes exactly one way for an outside application to authenticate a
-- student: CAS at https://cas.sfu.ca/cas. No OIDC, no public SAML. So this is
-- a third credential column rather than another OAuth provider, and it follows
-- 007's rule exactly — its own partial unique index, never merged with the
-- other two doors by anything other than an explicit, deliberate link.
--
-- The difference from 007 worth knowing: this address IS verified. The
-- computing ID comes from CAS, which checked the password itself, and the
-- email is derived from it rather than typed into a form. It is the only
-- address on this site that anybody has actually vouched for.

ALTER TABLE meetup.users ADD COLUMN IF NOT EXISTS sfu_username VARCHAR(32);

-- Which handler CAS used: student, faculty, staff, alumni, sponsored, sfu.
-- Stored but not acted on — nobody is turned away today. Keeping it means a
-- future "students only" rule is one comparison rather than a migration and a
-- round of sign-outs.
ALTER TABLE meetup.users ADD COLUMN IF NOT EXISTS sfu_authtype VARCHAR(20);

-- Partial for the same reason 007's is: it is the identity of the SFU door and
-- of nothing else. A Google row whose address happens to be someone@sfu.ca is
-- a different row and stays one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetup_users_sfu_username
  ON meetup.users (LOWER(sfu_username))
  WHERE sfu_username IS NOT NULL;

-- A row still has to be reachable through some door; now there are three.
--
-- Widening is always safe to re-run: every row that satisfied the narrower
-- version satisfies this one, and a database left without the constraint by an
-- earlier failed run gets it back here.
--
-- Guarded the way 007 guards its own version of this, and for the same reason.
-- Migrations re-run from the top, so a database that has already gone past
-- this file arrives carrying 011's wider constraint — one that also accepts a
-- tombstone, a row whose credentials have moved to the account it was merged
-- into. Re-adding the version below on such a database fails on the first
-- tombstone, and leaves the table with no credential constraint at all,
-- because the DROP has already gone through by the time the ADD is refused.
--
-- The test is the merged_into column rather than the constraint, because the
-- constraint may be missing precisely because that is the damage being
-- repaired.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'meetup' AND table_name = 'users' AND column_name = 'merged_into'
  ) THEN
    -- Dropped first because ADD CONSTRAINT has no IF NOT EXISTS.
    ALTER TABLE meetup.users DROP CONSTRAINT IF EXISTS users_has_credential;

    ALTER TABLE meetup.users ADD CONSTRAINT users_has_credential
      CHECK (google_sub IS NOT NULL OR password_hash IS NOT NULL OR sfu_username IS NOT NULL);
  END IF;
END $$;
