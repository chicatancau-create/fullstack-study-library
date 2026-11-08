SET search_path TO sql50;
SELECT DISTINCT user_id FROM orders WHERE status = 'paid' AND user_id IN (SELECT id FROM users) ORDER BY user_id;
