-- Fairway — élagage (12/11/2026)

-- Pars corrigés par les joueurs : seul un par confirmé à l'enregistrement modifie la base (1 vote suffit).
ALTER TABLE par_votes ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0;

-- Journal des pars propagés dans golf_holes, pour suivi et annulation depuis l'admin.
CREATE TABLE IF NOT EXISTS par_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  golf_id     INTEGER NOT NULL REFERENCES golfs(id) ON DELETE CASCADE,
  course      TEXT NOT NULL DEFAULT '',
  hole        INTEGER NOT NULL,
  old_par     INTEGER,            -- NULL : le trou n'était pas renseigné
  old_source  TEXT,
  new_par     INTEGER NOT NULL,
  user_id     TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  session_id  TEXT,
  origin      TEXT NOT NULL DEFAULT 'confirm',   -- confirm | backfill
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  reverted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_par_changes_recent ON par_changes(created_at);

-- Parties mises en favori (onglet Favoris > Parties).
ALTER TABLE play_sessions ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
