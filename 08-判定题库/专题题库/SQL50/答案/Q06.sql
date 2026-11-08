SET search_path TO sql50;
SELECT title FROM tasks WHERE status = 'done' ORDER BY id;
