SET search_path TO sql50;
SELECT id, priority FROM tasks ORDER BY priority DESC, id LIMIT 3;
