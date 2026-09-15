-- What people tell us from the little button in the corner.
--
-- Sign-in is not a precondition. Most of the site works signed out -- a group
-- page opens from an invite link with no account involved -- so the person best
-- placed to say what is broken is often the one who never signed in, and a
-- feedback box that demands an account only collects feedback from people who
-- already got past the thing they wanted to complain about.
--
-- Hence two independent identity columns. user_id is ours, filled from the
-- session when there is one, and survives a name change because it is a
-- reference rather than a copy. email is what they typed, kept even when
-- user_id is set: someone signed in with Google may still want a reply
-- somewhere else. Either or both may be NULL, and an entirely anonymous row is
-- a legitimate row.
--
-- ON DELETE SET NULL rather than CASCADE: a deleted account should not silently
-- retract a bug report that is still true. The message outlives the reporter.

CREATE TABLE IF NOT EXISTS meetup.feedback (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES meetup.users(id) ON DELETE SET NULL,
  email      VARCHAR(200),
  message    VARCHAR(2000) NOT NULL,
  -- Which page it was sent from. "The week grid is wrong" means one thing from
  -- /g/ABC123 and another from /my-schedule, and nobody ever remembers to say.
  path       VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The portal reads newest first, and the throttle reads one user's last few
-- minutes. Both are covered here.
CREATE INDEX IF NOT EXISTS idx_meetup_feedback_created
  ON meetup.feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetup_feedback_user
  ON meetup.feedback (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Dropped first: migrations here re-run from the top and ADD CONSTRAINT has no
-- IF NOT EXISTS.
ALTER TABLE meetup.feedback DROP CONSTRAINT IF EXISTS feedback_message_said_something;

-- A row of spaces is not feedback. The API trims before writing, so this only
-- ever fires on something that bypassed it.
ALTER TABLE meetup.feedback ADD CONSTRAINT feedback_message_said_something
  CHECK (length(btrim(message)) > 0);
