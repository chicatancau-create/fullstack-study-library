SET search_path TO sql50;
SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid='sql50.users'::regclass AND i.indisprimary;
