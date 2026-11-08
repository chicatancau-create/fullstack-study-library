SET search_path TO sql50;
SELECT team_id, id, row_number() OVER (PARTITION BY team_id ORDER BY id) AS rn FROM tasks ORDER BY team_id, id;
