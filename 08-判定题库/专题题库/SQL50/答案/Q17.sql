SET search_path TO sql50;
SELECT id, ntile(2) OVER (ORDER BY id) AS bucket FROM tasks ORDER BY id;
