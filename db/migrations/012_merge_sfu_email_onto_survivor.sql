-- When folding accounts, prefer the row that already holds groups over an
-- empty shell — and when the SFU credential moves onto a Google survivor,
-- wear the verified @sfu.ca address without leaving the Gmail one as email.
--
-- 011 always kept the SFU row as survivor so the address came along for free.
-- That made an empty Computing-ID first-sign-in look like it "keeps your stuff"
-- while the Google account with the groups was labelled as folding away. Groups
-- did move either way, but the confirm screen was the wrong promise. chooseSurvivor
-- in lib/account-link.ts now picks the non-empty side; this function must then
-- rewrite email when take_sfu is true so the merged account still wears @sfu.ca.

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
  IF s.sfu_username IS NOT NULL AND a.sfu_username IS NOT NULL THEN
    RAISE EXCEPTION 'merge_accounts: % and % are different SFU accounts', survivor_id, absorbed_id;
  END IF;

  take_google   := s.google_sub    IS NULL AND a.google_sub    IS NOT NULL;
  take_password := s.password_hash IS NULL AND a.password_hash IS NOT NULL;
  take_sfu      := s.sfu_username  IS NULL AND a.sfu_username  IS NOT NULL;

  SELECT COUNT(*) INTO dup_courses FROM meetup.user_courses WHERE user_id = absorbed_id;
  INSERT INTO meetup.user_courses (user_id, term, class_number)
  SELECT survivor_id, term, class_number FROM meetup.user_courses WHERE user_id = absorbed_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_courses = ROW_COUNT;
  dup_courses := dup_courses - n_courses;
  DELETE FROM meetup.user_courses WHERE user_id = absorbed_id;

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

  SELECT COUNT(*) INTO lost_blocks
    FROM meetup.member_blocks b
    JOIN meetup.members m ON m.id = b.member_id
   WHERE m.user_id = absorbed_id
     AND EXISTS (SELECT 1 FROM meetup.members k WHERE k.user_id = survivor_id AND k.group_id = m.group_id);

  DELETE FROM meetup.members AS m
   WHERE m.user_id = absorbed_id
     AND EXISTS (SELECT 1 FROM meetup.members k WHERE k.user_id = survivor_id AND k.group_id = m.group_id);
  GET DIAGNOSTICS dup_members = ROW_COUNT;

  UPDATE meetup.members SET user_id = survivor_id WHERE user_id = absorbed_id;
  GET DIAGNOSTICS n_members = ROW_COUNT;

  UPDATE meetup.groups SET owner_user_id = survivor_id WHERE owner_user_id = absorbed_id;
  GET DIAGNOSTICS n_groups = ROW_COUNT;

  UPDATE meetup.feedback SET user_id = survivor_id WHERE user_id = absorbed_id;
  GET DIAGNOSTICS n_feedback = ROW_COUNT;

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
         -- SFU's address is the only verified one; wear it when that door moves in.
         email      = CASE WHEN take_sfu THEN a.email ELSE email END,
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
