SET search_path TO sql50;
SELECT DISTINCT team_id, first_value(title) OVER (PARTITION BY team_id ORDER BY id) AS first_title FROM tasks ORDER BY team_id;
