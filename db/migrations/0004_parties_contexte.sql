-- « Mes parties » : compétition liée, humeur, forme physique et météo (échelles 1–5, 3 = normal/OK).
ALTER TABLE play_sessions ADD COLUMN event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE play_sessions ADD COLUMN event_title TEXT;   -- copie du titre (reste lisible si l'événement disparaît)
ALTER TABLE play_sessions ADD COLUMN mood INTEGER CHECK (mood BETWEEN 1 AND 5);
ALTER TABLE play_sessions ADD COLUMN body INTEGER CHECK (body BETWEEN 1 AND 5);
ALTER TABLE play_sessions ADD COLUMN weather INTEGER CHECK (weather BETWEEN 1 AND 5);
CREATE INDEX idx_play_event ON play_sessions(event_id);
