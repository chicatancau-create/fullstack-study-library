SET search_path TO sql50;
SELECT (SELECT count(*) FROM tasks) + (SELECT count(*) FROM orders) AS total;
