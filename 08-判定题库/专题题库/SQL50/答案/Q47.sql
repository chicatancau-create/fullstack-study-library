SET search_path TO sql50;
SELECT ('{"a":1}'::jsonb ->> 'a') AS v;
