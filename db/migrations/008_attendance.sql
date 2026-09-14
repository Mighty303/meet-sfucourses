-- Whether someone is actually going to a class on a particular date.
--
-- The grid until now drew an enrolment timetable and read it as a presence
-- timetable. Those differ every week: a recorded lecture gets skipped, a
-- seminar is attended from a kitchen table, and the group still has to ask on
-- Discord who is genuinely coming in on Thursday. The answer belongs in the
-- schedule, because it changes the schedule -- a skipped class stops being busy
-- time, which opens a real window for everyone else.
--
-- Keyed on the user, not on the member row. The same person in three groups is
-- one person with one Thursday, so marking a class skipped once has to show in
-- all three. This is the same move 005_profile_schedule.sql made for courses,
-- for the same reason.
--
-- Only deviations are stored. No row means going, so an ordinary week writes
-- nothing at all and the table stays proportional to how much people fiddle
-- rather than to how many classes exist.

CREATE TABLE IF NOT EXISTS meetup.attendance (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES meetup.users(id) ON DELETE CASCADE,
  on_date      DATE NOT NULL,
  class_number VARCHAR(6),
  status       VARCHAR(10) NOT NULL,
  note         VARCHAR(80),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two partial indexes rather than one UNIQUE(user_id, on_date, class_number),
-- because NULL is never equal to NULL in a unique index: the plain constraint
-- would happily accept an unbounded pile of whole-day rows for one date. Split
-- on the predicate, the day-level row is genuinely unique and the class-level
-- rows are unique per class. Same shape as idx_meetup_members_group_user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetup_attendance_class
  ON meetup.attendance (user_id, on_date, class_number)
  WHERE class_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetup_attendance_day
  ON meetup.attendance (user_id, on_date)
  WHERE class_number IS NULL;

-- The read is always "these members, this week", so the lookup is by user over
-- a date range.
CREATE INDEX IF NOT EXISTS idx_meetup_attendance_user_date
  ON meetup.attendance (user_id, on_date);

-- Dropped first: migrations here re-run from the top and ADD CONSTRAINT has no
-- IF NOT EXISTS.
ALTER TABLE meetup.attendance DROP CONSTRAINT IF EXISTS attendance_status_known;

ALTER TABLE meetup.attendance ADD CONSTRAINT attendance_status_known
  CHECK (status IN ('going', 'skipping', 'remote'));

-- No foreign key on class_number. The app persists class numbers and resolves
-- sections against the cached term dump at read time, so there is no row here
-- to point at -- see meetup.member_courses, which does the same.
