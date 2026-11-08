SET search_path TO sql50;
SELECT count(*) FROM pg_constraint WHERE conrelid = 'sql50.tasks'::regclass AND contype IN ('p','u');
