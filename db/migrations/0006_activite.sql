-- Fairway — suivi de l'activité des testeurs (zone admin).
-- Chaque appareil a un identifiant tiré au hasard (localStorage). Un appareil peut être anonyme ou rattaché à un compte.
-- Les mêmes tables sont créées à la volée par le Worker (worker/lib/activity.ts) si la migration n'a pas tourné.

CREATE TABLE IF NOT EXISTS devices (
  device_id   TEXT PRIMARY KEY,
  user_id     TEXT,                 -- dernier compte vu sur cet appareil (NULL = jamais connecté)
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  user_agent  TEXT,
  ip          TEXT,
  country     TEXT,
  region      TEXT,
  city        TEXT,
  standalone  INTEGER,              -- 1 = PWA installée (écran d'accueil)
  screen      TEXT,                 -- « 390×844 @3 »
  lang        TEXT
);
CREATE INDEX IF NOT EXISTS devices_user ON devices(user_id);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,        -- ISO UTC (début de l'action)
  device_id   TEXT NOT NULL,
  visit_id    TEXT NOT NULL,        -- une ouverture de l'app
  user_id     TEXT,                 -- NULL = anonyme
  type        TEXT NOT NULL,        -- open | view | tap | input | api | error
  screen      TEXT,                 -- écran courant : tab/events, golf/12, session/…, sheet/login
  target      TEXT,                 -- libellé touché, champ saisi, route API
  detail      TEXT,                 -- JSON libre
  duration_ms INTEGER               -- view : temps passé sur l'écran
);
CREATE INDEX IF NOT EXISTS activity_user_ts ON activity(user_id, ts);
CREATE INDEX IF NOT EXISTS activity_device_ts ON activity(device_id, ts);
CREATE INDEX IF NOT EXISTS activity_ts ON activity(ts);
