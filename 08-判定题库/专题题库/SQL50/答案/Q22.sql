SET search_path TO sql50;
SELECT confrelid::regclass::text FROM pg_constraint WHERE conrelid = 'sql50.tasks'::regclass AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='sql50.tasks'::regclass AND attname='team_id')];
