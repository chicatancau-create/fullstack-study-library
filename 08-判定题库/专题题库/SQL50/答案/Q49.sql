SET search_path TO sql50;
SELECT CASE WHEN NULL IS NULL THEN 'null' ELSE 'value' END AS v;
