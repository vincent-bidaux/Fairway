-- Fairway — plans de parcours tirés d'OpenStreetMap (voir worker/plans/osm.ts et shared/plan.ts).
-- Une ligne par golf vérifié. level = 'none' quand aucun tracé de golf n'existe dans OSM autour du golf.
CREATE TABLE IF NOT EXISTS course_plans (
  golf_id    INTEGER PRIMARY KEY REFERENCES golfs(id) ON DELETE CASCADE,
  level      TEXT NOT NULL CHECK (level IN ('complet', 'partiel', 'inexistant', 'none')),
  plan       TEXT,                 -- JSON CoursePlan, NULL si level = 'none'
  osm        TEXT,                 -- éléments OSM d'origine, ex. « way/80747240 »
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  error      TEXT                  -- dernière erreur de collecte (le plan précédent est conservé)
);
CREATE INDEX IF NOT EXISTS idx_course_plans_checked ON course_plans(checked_at);
