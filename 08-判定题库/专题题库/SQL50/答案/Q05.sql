SET search_path TO sql50;
SELECT team_id FROM users GROUP BY team_id HAVING count(*) >= 2 ORDER BY team_id;
