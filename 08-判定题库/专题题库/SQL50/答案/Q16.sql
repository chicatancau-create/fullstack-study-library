SET search_path TO sql50;
SELECT user_id, id, sum(amount) OVER (PARTITION BY user_id ORDER BY id) AS running FROM orders ORDER BY user_id, id;
