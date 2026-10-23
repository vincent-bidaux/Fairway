-- Richer golf records (from the ffgolf directory) + key/value metadata (seed version…)
ALTER TABLE golfs ADD COLUMN email TEXT;
ALTER TABLE golfs ADD COLUMN address TEXT;
ALTER TABLE golfs ADD COLUMN photo_url TEXT;

CREATE TABLE meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
