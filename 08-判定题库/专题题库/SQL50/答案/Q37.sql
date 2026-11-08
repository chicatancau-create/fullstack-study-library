SET search_path TO sql50;
SELECT data_type FROM information_schema.columns WHERE table_schema='sql50' AND table_name='orders' AND column_name='amount';
