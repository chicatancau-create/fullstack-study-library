SET search_path TO sql50;
SELECT date_trunc('month', timestamp '2026-02-15 10:00')::date::text AS v;
