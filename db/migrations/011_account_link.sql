-- Folding one person's several accounts into one.
--
-- 007 and 010 each made the same promise: a door gets its own credential
-- column and its own partial unique index, and two doors are never reconciled
-- "by anything other than an explicit, deliberate link". This is that link.
--
-- The rule it must not break is the one 007 spent a page on: an address is not
-- a proof. A password row's email is typed into a form, so merging on matching
-- addresses would let a registration absorb somebody's Google account. So the
-- proof here is possession of both: signed in as A, complete a live sign-in as
-- B in the same browser inside ten minutes, and only then do the rows fold.
-- meetup.link_challenges below is that ten minutes.
--
-- Two shapes worth knowing before reading the function:
--
--   * The surviving row is the one with an SFU credential when there is one.
--     Its address is derived from a computing ID CAS vouched for, which makes
--     it the only address on this site anybody has verified -- so the merged
--     account ends up wearing it without any column being rewritten.
--
--   * The absorbed row is tombstoned, not deleted. It keeps its id, its
--     created_at and its old address, and points at the survivor through
--     merged_into. A session cookie on another device then still resolves to a
--     live account rather than to nothing, and #29's invite-by-email can still
--     answer "who is this address?" after a merge.

/**
 * Google's own address, kept apart from users.email.
 *
 * After a merge the account's email is the @sfu.ca one, and lib/admin.ts
 * compares an allowlist against the address Google vouched for. Without a
 * column of its own that address is gone the moment the SFU row wins, and an
 * admin would quietly lose the portal by linking their own accounts.
 *
 * email_verified is the claim that makes an automatic offer safe to make at
 * all -- see the collision prompt in app/api/auth/sfu/callback. NULL means
 * "not asked yet" for every row that predates this migration, and unknown is
 * treated as unverified.
 */
ALTER TABLE meetup.users ADD COLUMN IF NOT EXISTS google_email VARCHAR(255);
ALTER TABLE meetup.users ADD COLUMN IF NOT EXISTS google_email_verified BOOLEAN;

/**
 * Google's hosted-domain claim: present only for a Workspace account, and
 * equal to the tenant's domain. Stored but not yet acted on. If sfu.ca turns
 * out to be a Workspace tenant this is a far stronger signal than
 * email_verified alone, and the collision predicate can tighten to it without
 * a migration.
 */
ALTER TABLE meetup.users ADD COLUMN IF NOT EXISTS google_hd VARCHAR(255);

-- Backfill only what we can know. Every existing Google row's email came from
-- Google, so it is that row's google_email; whether Google had verified it is
-- not recorded anywhere and stays NULL until the next sign-in stamps it.
UPDATE meetup.users
SET google_email = email
WHERE google_sub IS NOT NULL AND google_email IS NULL;

/**
 * Where this row's account actually lives, or NULL on every live account.
 *
 * Set on the absorbed row by merge_accounts(). CASCADE because a tombstone is
 * part of the account it points at: deleting the account should not leave a
 * shell behind pointing at nothing.
 *
 * Always terminal, never a chain -- merge_accounts() re-points any tombstone
 * already aimed at the absorbed row, so resolving an id is one hop forever
 * rather than a loop with a depth limit.
 */
ALTER TABLE meetup.users
  ADD COLUMN IF NOT EXISTS merged_into INTEGER REFERENCES meetup.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_meetup_users_merged_into
  ON meetup.users (merged_into)
  WHERE merged_into IS NOT NULL;

/**
 * A row still has to be reachable, and now there is a fourth way to be: by
 * being part of somebody else's account.
 *
 * A tombstone may keep credentials (see merge_accounts) but it may equally
 * have handed all of them over, and the narrower constraint would refuse the
 * second case. This file states the constraint for everyone who has got this
 * far; 010 stands down as soon as merged_into exists, exactly as 007 stands
 * down once sfu_username does.
 */
ALTER TABLE meetup.users DROP CONSTRAINT IF EXISTS users_has_credential;

ALTER TABLE meetup.users ADD CONSTRAINT users_has_credential
  CHECK (
    google_sub IS NOT NULL
    OR password_hash IS NOT NULL
    OR sfu_username IS NOT NULL
    OR merged_into IS NOT NULL
  );

/**
 * The ten minutes in which a link may be proved.
 *
 * A row is made while signed in as A and handed to the browser as a cookie;
 * the browser then goes and signs in as B through whichever door it likes, and
 * comes back holding both halves. That is the entire proof, and it is why no
 * door needs a link-mode branch: an ordinary sign-in is what completes it.
 *
 * The cookie carries the token; this table stores only its SHA-256, so a
 * dump of the database is not a pile of live link tokens. consumed_at rather
 * than a delete, so a double-submitted confirm is refused rather than racing.
 */
CREATE TABLE IF NOT EXISTS meetup.link_challenges (
  id          SERIAL PRIMARY KEY,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES meetup.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

-- Sweeping expired rows is the only read that isn't by token_hash.
CREATE INDEX IF NOT EXISTS idx_meetup_link_challenges_expires
  ON meetup.link_challenges (expires_at);

/**
 * What a merge did, including what it had to throw away.
 *
 * Merging is one-way: the rows move, and no tag on them would bring back an
 * attendance entry that lost a conflict. So this is not an undo log, it is the
 * thing to read when somebody says a merge went wrong. Who was merged is on
 * the tombstone; this records what happened to their rows.
 */
CREATE TABLE IF NOT EXISTS meetup.account_merges (
  id                SERIAL PRIMARY KEY,
  surviving_user_id INTEGER NOT NULL REFERENCES meetup.users(id) ON DELETE CASCADE,
  absorbed_user_id  INTEGER NOT NULL REFERENCES meetup.users(id) ON DELETE CASCADE,
  -- Counts of what was repointed and what was discarded, by table.
  moved             JSONB NOT NULL,
  dropped           JSONB NOT NULL,
  merged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetup_account_merges_surviving
  ON meetup.account_merges (surviving_user_id, merged_at DESC);

/**
 * Fold `absorbed` into `survivor`, atomically.
 *
 * A function rather than a list of statements from the application, for three
 * reasons. neon-http transactions are non-interactive -- sql.transaction()
 * takes a fixed list and cannot branch -- and this merge has to decide things
 * mid-flight. It has to read the absorbed row's credentials before the
 * statement that frees the unique indexes holding them. And the ordering below
 * is a consequence of the partial unique indexes in 007, 008 and 010, so it
 * belongs next to them rather than in a TypeScript file that cannot see them.
 *
 * Raises rather than returning an error, so a violated precondition rolls the
 * whole thing back instead of half-merging somebody.
 *
 * What survives a conflict, in every case: the survivor. Its courses, its
 * attendance, its member row, its name and picture. Nothing the survivor did
 * not already have is discarded, so the only losses are duplicates -- with the
 * one real exception of a duplicate member row's name, colour and non-course
 * busy blocks, which is why the confirm screen has to show that count before
 * anyone presses the button.
 *
 * Credentials move only into a gap. If the survivor already holds a google_sub
 * the absorbed row keeps its own, and keeps opening this account through
 * merged_into -- discarding it would leave that Google sign-in minting a fresh
 * empty row next time, which is the exact split this whole feature exists to
 * end.
 */
CREATE OR REPLACE FUNCTION meetup.merge_accounts(survivor_id INTEGER, absorbed_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $fn$
DECLARE
  s meetup.users%ROWTYPE;
  a meetup.users%ROWTYPE;
  take_google   BOOLEAN;
  take_password BOOLEAN;
  take_sfu      BOOLEAN;
  n_courses    INTEGER := 0;
  n_attendance INTEGER := 0;
  n_members    INTEGER := 0;
  n_groups     INTEGER := 0;
  n_feedback   INTEGER := 0;
  n_aliases    INTEGER := 0;
  dup_courses    INTEGER := 0;
  dup_attendance INTEGER := 0;
  dup_members    INTEGER := 0;
  lost_blocks    INTEGER := 0;
BEGIN
  IF survivor_id = absorbed_id THEN
    RAISE EXCEPTION 'merge_accounts: survivor and absorbed are the same row (%)', survivor_id;
  END IF;

  -- Lowest id first, so two merges naming the same pair queue instead of
  -- deadlocking against each other.
  PERFORM 1 FROM meetup.users WHERE id IN (survivor_id, absorbed_id) ORDER BY id FOR UPDATE;

  SELECT * INTO s FROM meetup.users WHERE id = survivor_id;
  SELECT * INTO a FROM meetup.users WHERE id = absorbed_id;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'merge_accounts: no user %', survivor_id;
  END IF;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'merge_accounts: no user %', absorbed_id;
  END IF;
  IF s.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'merge_accounts: % is a tombstone, not an account', survivor_id;
  END IF;
  IF a.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'merge_accounts: % is a tombstone, not an account', absorbed_id;
  END IF;
  -- idx_meetup_users_sfu_username means two rows cannot hold one computing ID,
  -- so this is a caller that has confused two different people.
  IF s.sfu_username IS NOT NULL AND a.sfu_username IS NOT NULL THEN
    RAISE EXCEPTION 'merge_accounts: % and % are different SFU accounts', survivor_id, absorbed_id;
  END IF;

  take_google   := s.google_sub    IS NULL AND a.google_sub    IS NOT NULL;
  take_password := s.password_hash IS NULL AND a.password_hash IS NOT NULL;
  take_sfu      := s.sfu_username  IS NULL AND a.sfu_username  IS NOT NULL;

  -- Union, the same call claimMember() makes: an extra section is visible on
  -- your own grid and removable in one click, a dropped one is invisible until
  -- somebody schedules over a class you are sitting in.
  SELECT COUNT(*) INTO dup_courses FROM meetup.user_courses WHERE user_id = absorbed_id;
  INSERT INTO meetup.user_courses (user_id, term, class_number)
  SELECT survivor_id, term, class_number FROM meetup.user_courses WHERE user_id = absorbed_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_courses = ROW_COUNT;
  dup_courses := dup_courses - n_courses;
  DELETE FROM meetup.user_courses WHERE user_id = absorbed_id;

  -- Only the dates the survivor has said nothing about. IS NOT DISTINCT FROM
  -- because a whole-day row carries a NULL class_number, and 008 splits the
  -- uniqueness into two partial indexes for exactly that reason.
  UPDATE meetup.attendance AS t
     SET user_id = survivor_id
   WHERE t.user_id = absorbed_id
     AND NOT EXISTS (
       SELECT 1 FROM meetup.attendance x
        WHERE x.user_id = survivor_id
          AND x.on_date = t.on_date
          AND x.class_number IS NOT DISTINCT FROM t.class_number
     );
  GET DIAGNOSTICS n_attendance = ROW_COUNT;
  DELETE FROM meetup.attendance WHERE user_id = absorbed_id;
  GET DIAGNOSTICS dup_attendance = ROW_COUNT;

  -- The one place a merge genuinely loses something: a group both rows are in
  -- keeps the survivor's member row, and the other row's name, colour and busy
  -- blocks go with it. idx_meetup_members_group_user forbids keeping both.
  SELECT COUNT(*) INTO lost_blocks
    FROM meetup.member_blocks b
    JOIN meetup.members m ON m.id = b.member_id
   WHERE m.user_id = absorbed_id
     AND EXISTS (SELECT 1 FROM meetup.members k WHERE k.user_id = survivor_id AND k.group_id = m.group_id);

  DELETE FROM meetup.members AS m
   WHERE m.user_id = absorbed_id
     AND EXISTS (SELECT 1 FROM meetup.members k WHERE k.user_id = survivor_id AND k.group_id = m.group_id);
  GET DIAGNOSTICS dup_members = ROW_COUNT;

  -- Whatever is left is in a group the survivor was absent from, so
  -- UNIQUE(group_id, display_name) has nothing to collide with.
  UPDATE meetup.members SET user_id = survivor_id WHERE user_id = absorbed_id;
  GET DIAGNOSTICS n_members = ROW_COUNT;

  UPDATE meetup.groups SET owner_user_id = survivor_id WHERE owner_user_id = absorbed_id;
  GET DIAGNOSTICS n_groups = ROW_COUNT;

  UPDATE meetup.feedback SET user_id = survivor_id WHERE user_id = absorbed_id;
  GET DIAGNOSTICS n_feedback = ROW_COUNT;

  -- Rows already merged into the one being absorbed follow it across, which is
  -- what keeps merged_into terminal: resolving an id is one hop, never a walk.
  UPDATE meetup.users SET merged_into = survivor_id WHERE merged_into = absorbed_id;
  GET DIAGNOSTICS n_aliases = ROW_COUNT;

  INSERT INTO meetup.account_merges (surviving_user_id, absorbed_user_id, moved, dropped)
  VALUES (
    survivor_id,
    absorbed_id,
    jsonb_build_object(
      'user_courses', n_courses,
      'attendance', n_attendance,
      'members', n_members,
      'groups_owned', n_groups,
      'feedback', n_feedback,
      'tombstones', n_aliases,
      'credentials', jsonb_build_object(
        'google', take_google, 'password', take_password, 'sfu', take_sfu
      )
    ),
    jsonb_build_object(
      'duplicate_courses', dup_courses,
      'duplicate_attendance', dup_attendance,
      'duplicate_members', dup_members,
      'member_blocks', lost_blocks
    )
  );

  -- Before the survivor's update, never after: nulling the credentials that
  -- are moving is what frees google_sub's UNIQUE and the two partial indexes,
  -- and the copy below would be refused while this row still held them.
  UPDATE meetup.users
     SET google_sub            = CASE WHEN take_google   THEN NULL ELSE google_sub END,
         google_email          = CASE WHEN take_google   THEN NULL ELSE google_email END,
         google_email_verified = CASE WHEN take_google   THEN NULL ELSE google_email_verified END,
         google_hd             = CASE WHEN take_google   THEN NULL ELSE google_hd END,
         password_hash         = CASE WHEN take_password THEN NULL ELSE password_hash END,
         sfu_username          = CASE WHEN take_sfu      THEN NULL ELSE sfu_username END,
         sfu_authtype          = CASE WHEN take_sfu      THEN NULL ELSE sfu_authtype END,
         merged_into           = survivor_id,
         updated_at            = NOW()
   WHERE id = absorbed_id;

  UPDATE meetup.users
     SET google_sub            = CASE WHEN take_google   THEN a.google_sub ELSE google_sub END,
         google_email          = CASE WHEN take_google   THEN a.google_email ELSE google_email END,
         google_email_verified = CASE WHEN take_google   THEN a.google_email_verified ELSE google_email_verified END,
         google_hd             = CASE WHEN take_google   THEN a.google_hd ELSE google_hd END,
         password_hash         = CASE WHEN take_password THEN a.password_hash ELSE password_hash END,
         sfu_username          = CASE WHEN take_sfu      THEN a.sfu_username ELSE sfu_username END,
         sfu_authtype          = CASE WHEN take_sfu      THEN a.sfu_authtype ELSE sfu_authtype END,
         name       = COALESCE(name, a.name),
         image      = COALESCE(image, a.image),
         avatar     = COALESCE(avatar, a.avatar),
         last_seen_at = GREATEST(last_seen_at, a.last_seen_at),
         updated_at = NOW()
   WHERE id = survivor_id;

  RETURN jsonb_build_object(
    'survivor', survivor_id,
    'absorbed', absorbed_id,
    'moved', jsonb_build_object(
      'user_courses', n_courses, 'attendance', n_attendance, 'members', n_members,
      'groups_owned', n_groups, 'feedback', n_feedback, 'tombstones', n_aliases
    ),
    'dropped', jsonb_build_object(
      'duplicate_courses', dup_courses, 'duplicate_attendance', dup_attendance,
      'duplicate_members', dup_members, 'member_blocks', lost_blocks
    )
  );
END;
$fn$;
