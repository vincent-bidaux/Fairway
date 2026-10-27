-- Fairway — programme testeurs : retours (fil de discussion par joueur) et identité du joueur.

-- Un message par ligne : retour d'un testeur (author = 'user', avec une catégorie) ou réponse de l'admin (author = 'admin').
CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  author      TEXT NOT NULL CHECK (author IN ('user', 'admin')),
  kind        TEXT CHECK (kind IN ('question', 'like', 'use', 'dislike', 'unused', 'bug', 'idea')),
  body        TEXT NOT NULL,
  context     TEXT,                 -- JSON : version de l'app, écran d'où le retour est parti, appareil
  created_at  TEXT NOT NULL,        -- ISO UTC
  read_at     TEXT                  -- lu par l'autre partie (admin pour un retour, testeur pour une réponse)
);
CREATE INDEX IF NOT EXISTS feedback_user ON feedback(user_id, created_at);
CREATE INDEX IF NOT EXISTS feedback_unread ON feedback(author, read_at);

-- Identité du joueur (le pseudo reste display_name).
ALTER TABLE player_profiles ADD COLUMN first_name TEXT;
ALTER TABLE player_profiles ADD COLUMN last_name TEXT;
