SET search_path TO sql50;
SELECT count(*) FROM pg_constraint WHERE conrelid = 'sql50.orders'::regclass AND contype = 'c';
