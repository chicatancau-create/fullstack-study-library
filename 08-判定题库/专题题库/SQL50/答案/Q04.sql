SET search_path TO sql50;
SELECT team_id, count(*) AS n FROM users GROUP BY team_id ORDER BY team_id;
