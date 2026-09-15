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
-- Dropped first because migrations here re-run from the top and ADD CONSTRAINT
-- has no IF NOT EXISTS.
ALTER TABLE meetup.users DROP CONSTRAINT IF EXISTS users_has_credential;

ALTER TABLE meetup.users ADD CONSTRAINT users_has_credential
  CHECK (google_sub IS NOT NULL OR password_hash IS NOT NULL OR sfu_username IS NOT NULL);
