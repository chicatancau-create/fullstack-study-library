SET search_path TO sql50;
SELECT team_id, id, priority, dense_rank() OVER (PARTITION BY team_id ORDER BY priority DESC) AS d FROM tasks ORDER BY team_id, d, id;
