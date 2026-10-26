-- Fairway — « Mes parties » : position et club de chaque coup, sac du joueur.
-- shots : JSON [{ "lat": 46.2, "lon": -1.16, "club": "7i" }, …] ; l'élément i est la balle avant le coup i+1
-- (le 1er est le départ). lat/lon ou club peuvent être null.
ALTER TABLE round_holes ADD COLUMN shots TEXT;
-- bag : JSON ["D", "3W", "4H", "5i", …] (identifiants de shared/practice.ts CLUBS), dans l'ordre du sac.
ALTER TABLE player_profiles ADD COLUMN bag TEXT;
