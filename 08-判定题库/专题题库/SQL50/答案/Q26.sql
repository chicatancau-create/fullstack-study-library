SET search_path TO sql50;
SELECT count(*) FROM pg_indexes WHERE schemaname='sql50' AND tablename='tasks' AND indexdef LIKE '%team_id, status%';
