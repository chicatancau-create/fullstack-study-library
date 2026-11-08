SET search_path TO sql50;
SELECT u.name, t.name AS team FROM users u JOIN teams t ON t.id = u.team_id ORDER BY u.id;
