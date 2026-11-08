SET search_path TO sql50;
SELECT sum(i) FROM generate_series(1,10) AS g(i);
