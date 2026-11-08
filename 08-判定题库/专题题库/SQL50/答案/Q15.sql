SET search_path TO sql50;
SELECT user_id, id, lead(amount) OVER (PARTITION BY user_id ORDER BY id) AS nxt FROM orders ORDER BY user_id, id;
