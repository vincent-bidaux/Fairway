-- Fairway — initial schema

CREATE TABLE departments (
  code    TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  region  TEXT NOT NULL
);

INSERT INTO departments (code, name, region) VALUES
  ('16', 'Charente', 'Nouvelle-Aquitaine'),
  ('17', 'Charente-Maritime', 'Nouvelle-Aquitaine'),
  ('19', 'Corrèze', 'Nouvelle-Aquitaine'),
  ('23', 'Creuse', 'Nouvelle-Aquitaine'),
  ('24', 'Dordogne', 'Nouvelle-Aquitaine'),
  ('33', 'Gironde', 'Nouvelle-Aquitaine'),
  ('40', 'Landes', 'Nouvelle-Aquitaine'),
  ('47', 'Lot-et-Garonne', 'Nouvelle-Aquitaine'),
  ('64', 'Pyrénées-Atlantiques', 'Nouvelle-Aquitaine'),
  ('79', 'Deux-Sèvres', 'Nouvelle-Aquitaine'),
  ('86', 'Vienne', 'Nouvelle-Aquitaine'),
  ('87', 'Haute-Vienne', 'Nouvelle-Aquitaine');

-- Finite reference list of golf courses.
CREATE TABLE golfs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  department       TEXT NOT NULL REFERENCES departments(code),
  city             TEXT NOT NULL,
  postcode         TEXT,
  lat              REAL,
  lng              REAL,
  holes            INTEGER,
  website          TEXT,
  phone            TEXT,
  ffgolf_id        TEXT,
  notes            TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_golfs_dept ON golfs(department);
CREATE INDEX idx_golfs_geo ON golfs(lat, lng);

-- Where competition dates are collected from. One golf can have several sources;
-- a source can also be regional (ligue, comité) with golf_id NULL.
CREATE TABLE sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  golf_id       INTEGER REFERENCES golfs(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('club_page','ffgolf','ligue','comite','platform')),
  parser        TEXT NOT NULL DEFAULT 'llm' CHECK (parser IN ('llm','ical')),
  label         TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   TEXT,
  last_status   TEXT CHECK (last_status IN ('ok','unchanged','error')),
  last_error    TEXT,
  last_hash     TEXT,
  event_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sources_due ON sources(enabled, last_run_at);

CREATE TABLE events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  golf_id           INTEGER NOT NULL REFERENCES golfs(id) ON DELETE CASCADE,
  source_id         INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  fingerprint       TEXT NOT NULL UNIQUE,   -- golf_id|start_date|normalized title
  title             TEXT NOT NULL,
  start_date        TEXT NOT NULL,          -- YYYY-MM-DD
  end_date          TEXT,
  start_time        TEXT,
  type              TEXT NOT NULL DEFAULT 'autre',
  format            TEXT,
  eligibility       TEXT,
  price             TEXT,
  registration_url  TEXT,
  info_url          TEXT,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','full','removed')),
  first_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_date ON events(start_date, status);
CREATE INDEX idx_events_golf ON events(golf_id, start_date);
CREATE INDEX idx_events_source ON events(source_id);

CREATE TABLE crawl_runs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger            TEXT NOT NULL CHECK (trigger IN ('cron','manual')),
  started_at         TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at        TEXT,
  sources_ok         INTEGER NOT NULL DEFAULT 0,
  sources_unchanged  INTEGER NOT NULL DEFAULT 0,
  sources_failed     INTEGER NOT NULL DEFAULT 0,
  events_new         INTEGER NOT NULL DEFAULT 0,
  events_updated     INTEGER NOT NULL DEFAULT 0,
  log                TEXT
);
