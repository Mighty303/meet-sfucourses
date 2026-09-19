-- A group's own picture, chosen by its admin. Like user avatars, this is a
-- small browser-downscaled data URL: one bounded image per group is simpler
-- than a blob store and keeps the image with its row across database branches.
ALTER TABLE meetup.groups
  ADD COLUMN IF NOT EXISTS image TEXT;
