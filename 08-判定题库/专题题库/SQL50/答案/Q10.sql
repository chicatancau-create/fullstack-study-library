SET search_path TO sql50;
SELECT CASE WHEN priority >= 4 THEN 'high' ELSE 'low' END AS bucket, count(*) AS n FROM tasks GROUP BY 1 ORDER BY 1;
