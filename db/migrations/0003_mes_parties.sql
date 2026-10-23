-- Fairway — « Mes parties » : comptes joueurs (Better Auth) + séances, trous, exercices, pars.

-- ---------------------------------------------------------------- Better Auth (schéma généré, plugins username + emailOTP)
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "username" text unique, "displayUsername" text);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- ---------------------------------------------------------------- Pars des trous (référentiel partagé)
CREATE TABLE golf_holes (
  golf_id      INTEGER NOT NULL REFERENCES golfs(id) ON DELETE CASCADE,
  course       TEXT NOT NULL DEFAULT '',
  hole         INTEGER NOT NULL CHECK (hole BETWEEN 1 AND 18),
  par          INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  stroke_index INTEGER,
  source       TEXT NOT NULL CHECK (source IN ('club','osm','ffgolf','players')),
  source_url   TEXT,
  votes        INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (golf_id, course, hole)
);

CREATE TABLE par_votes (
  user_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  golf_id   INTEGER NOT NULL REFERENCES golfs(id) ON DELETE CASCADE,
  course    TEXT NOT NULL DEFAULT '',
  hole      INTEGER NOT NULL,
  par       INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  voted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, golf_id, course, hole)
);

-- ---------------------------------------------------------------- Séances : parties et practices
CREATE TABLE play_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('round','range')),
  golf_id      INTEGER REFERENCES golfs(id) ON DELETE SET NULL,
  course       TEXT NOT NULL DEFAULT '',
  place        TEXT,
  played_at    TEXT NOT NULL,
  holes        INTEGER CHECK (holes IN (9, 18)),
  start_hole   INTEGER NOT NULL DEFAULT 1,
  tee          TEXT,
  duration_min INTEGER,
  balls        INTEGER,
  focus        TEXT,
  feeling      INTEGER CHECK (feeling BETWEEN 1 AND 5),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);
CREATE INDEX idx_play_user ON play_sessions(user_id, deleted_at, played_at);
CREATE INDEX idx_play_golf ON play_sessions(golf_id, kind);

CREATE TABLE round_holes (
  session_id  TEXT NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  hole        INTEGER NOT NULL CHECK (hole BETWEEN 1 AND 18),
  par         INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  strokes     INTEGER CHECK (strokes BETWEEN 1 AND 20),
  putts       INTEGER CHECK (putts BETWEEN 0 AND 10),
  fairway     TEXT CHECK (fairway IN ('hit','left','right','short')),
  gir         INTEGER CHECK (gir IN (0, 1)),
  penalties   INTEGER NOT NULL DEFAULT 0,
  up_down     INTEGER CHECK (up_down IN (0, 1)),
  sand        INTEGER CHECK (sand IN (0, 1)),
  PRIMARY KEY (session_id, hole)
);

CREATE TABLE range_drills (
  session_id  TEXT NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('long','approach','chip','bunker','putting')),
  label       TEXT NOT NULL,
  distance_m  INTEGER,
  attempts    INTEGER,
  successes   INTEGER,
  PRIMARY KEY (session_id, position)
);

-- ---------------------------------------------------------------- Profil joueur (carte « joueur »)
CREATE TABLE player_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  display_name  TEXT,
  photo         TEXT,                 -- data URL JPEG 256×256 (≈ 20 Ko), redimensionnée sur le téléphone
  home_golf_id  INTEGER REFERENCES golfs(id) ON DELETE SET NULL,  -- club d'attache
  city          TEXT,
  birth_year    INTEGER CHECK (birth_year BETWEEN 1900 AND 2100),
  handedness    TEXT CHECK (handedness IN ('right','left')),
  licence       TEXT,                 -- n° de licence ffgolf (facultatif)
  started_year  INTEGER,              -- joue depuis
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index officiel déclaré par le joueur (historique → courbe d'évolution)
CREATE TABLE index_history (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  as_of       TEXT NOT NULL,          -- YYYY-MM-DD
  hcp_index   REAL NOT NULL CHECK (hcp_index BETWEEN -10 AND 54),
  PRIMARY KEY (user_id, as_of)
);
