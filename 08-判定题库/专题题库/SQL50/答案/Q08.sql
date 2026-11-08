SET search_path TO sql50;
SELECT id FROM users WHERE (SELECT count(*) FROM tasks WHERE owner_id = users.id) > 1 ORDER BY id;
