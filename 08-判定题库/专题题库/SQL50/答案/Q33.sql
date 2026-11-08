SET search_path TO sql50;
SELECT u.id, (SELECT o.id FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1) AS last_order FROM users u ORDER BY u.id;
