SET search_path TO sql50;
SELECT status, count(*) AS n FROM tasks GROUP BY status ORDER BY status;
