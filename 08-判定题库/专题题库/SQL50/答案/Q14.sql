SET search_path TO sql50;
SELECT user_id, id, lag(amount) OVER (PARTITION BY user_id ORDER BY id) AS prev FROM orders ORDER BY user_id, id;
