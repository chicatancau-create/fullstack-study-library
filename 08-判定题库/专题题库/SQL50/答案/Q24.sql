SET search_path TO sql50;
SELECT id FROM tasks WHERE id = 1 FOR UPDATE;
