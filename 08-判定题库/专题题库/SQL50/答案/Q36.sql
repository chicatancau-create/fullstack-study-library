SET search_path TO sql50;
SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_schema='sql50' AND table_name='tasks';
