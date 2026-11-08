SET search_path TO sql50;
SELECT count(*) FROM pg_indexes WHERE schemaname='sql50' AND tablename='users' AND indexdef LIKE '%UNIQUE%';
