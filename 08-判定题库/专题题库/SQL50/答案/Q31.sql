SET search_path TO sql50;
SELECT status, sum(amount) AS total FROM orders GROUP BY status ORDER BY status;
