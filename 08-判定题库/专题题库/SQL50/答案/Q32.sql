SET search_path TO sql50;
SELECT u.id FROM users u WHERE NOT EXISTS (SELECT 1 FROM tasks k WHERE k.owner_id = u.id) ORDER BY u.id;
