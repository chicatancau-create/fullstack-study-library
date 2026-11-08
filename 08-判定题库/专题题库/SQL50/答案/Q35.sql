SET search_path TO sql50;
SELECT count(*) FROM information_schema.tables WHERE table_schema='sql50' AND table_type='BASE TABLE';
