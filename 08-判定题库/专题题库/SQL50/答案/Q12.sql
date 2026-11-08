SET search_path TO sql50;
SELECT team_id, id, priority, rank() OVER (PARTITION BY team_id ORDER BY priority DESC) AS rnk FROM tasks ORDER BY team_id, rnk, id;
