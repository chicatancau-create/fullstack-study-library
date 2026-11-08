SET search_path TO sql50;
SELECT t.id, count(k.id) AS n FROM teams t LEFT JOIN tasks k ON k.team_id = t.id GROUP BY t.id ORDER BY t.id;
