SET search_path TO sql50;
SELECT team_id, status, count(*) FROM tasks GROUP BY team_id, status ORDER BY team_id, status;
