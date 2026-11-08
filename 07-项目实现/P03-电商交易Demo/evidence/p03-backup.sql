--
-- PostgreSQL database dump
--

\restrict AVMuYkIrq8JYgmrhdEDYhij0aRa14037H96U7hVKNbmbpfuEG14Og0791eH6Xvn

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: p03; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA p03;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: inventory; Type: TABLE; Schema: p03; Owner: -
--

CREATE TABLE p03.inventory (
    sku text NOT NULL,
    title text NOT NULL,
    unit_price integer NOT NULL,
    stock integer NOT NULL,
    CONSTRAINT inventory_stock_check CHECK ((stock >= 0)),
    CONSTRAINT inventory_unit_price_check CHECK ((unit_price > 0))
);


--
-- Name: notifications; Type: TABLE; Schema: p03; Owner: -
--

CREATE TABLE p03.notifications (
    event_id text NOT NULL,
    order_id integer NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: p03; Owner: -
--

CREATE TABLE p03.order_items (
    order_id integer NOT NULL,
    sku text NOT NULL,
    title text NOT NULL,
    unit_price integer NOT NULL,
    qty integer NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: p03; Owner: -
--

CREATE TABLE p03.orders (
    id integer NOT NULL,
    user_id text NOT NULL,
    idem_key text NOT NULL,
    request_hash text NOT NULL,
    sku text NOT NULL,
    qty integer NOT NULL,
    unit_price integer NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT orders_amount_check CHECK ((amount > 0)),
    CONSTRAINT orders_qty_check CHECK ((qty > 0)),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'cancelled'::text]))),
    CONSTRAINT orders_unit_price_check CHECK ((unit_price > 0))
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: p03; Owner: -
--

CREATE SEQUENCE p03.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: p03; Owner: -
--

ALTER SEQUENCE p03.orders_id_seq OWNED BY p03.orders.id;


--
-- Name: outbox; Type: TABLE; Schema: p03; Owner: -
--

CREATE TABLE p03.outbox (
    event_id text NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text])))
);


--
-- Name: payment_events; Type: TABLE; Schema: p03; Owner: -
--

CREATE TABLE p03.payment_events (
    event_id text NOT NULL,
    order_id integer NOT NULL,
    result text NOT NULL,
    applied boolean DEFAULT false NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_events_result_check CHECK ((result = ANY (ARRAY['success'::text, 'failed'::text])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: p03; Owner: -
--

CREATE TABLE p03.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orders id; Type: DEFAULT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.orders ALTER COLUMN id SET DEFAULT nextval('p03.orders_id_seq'::regclass);


--
-- Data for Name: inventory; Type: TABLE DATA; Schema: p03; Owner: -
--

COPY p03.inventory (sku, title, unit_price, stock) FROM stdin;
mq-sku	MQ 商品	100	9
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: p03; Owner: -
--

COPY p03.notifications (event_id, order_id, message, created_at) FROM stdin;
mq-paid-1	1	订单 1 已支付	2026-11-08 17:48:48.618798+08
bulk-2	1	订单 1 已支付	2026-11-08 17:48:49.443129+08
bulk-1	1	订单 1 已支付	2026-11-08 17:48:49.443069+08
bulk-11	1	订单 1 已支付	2026-11-08 17:48:49.446282+08
bulk-12	1	订单 1 已支付	2026-11-08 17:48:49.446336+08
bulk-13	1	订单 1 已支付	2026-11-08 17:48:49.447147+08
bulk-14	1	订单 1 已支付	2026-11-08 17:48:49.447233+08
bulk-15	1	订单 1 已支付	2026-11-08 17:48:49.448033+08
bulk-16	1	订单 1 已支付	2026-11-08 17:48:49.448083+08
bulk-17	1	订单 1 已支付	2026-11-08 17:48:49.448824+08
bulk-18	1	订单 1 已支付	2026-11-08 17:48:49.4489+08
bulk-19	1	订单 1 已支付	2026-11-08 17:48:49.449545+08
bulk-20	1	订单 1 已支付	2026-11-08 17:48:49.449636+08
bulk-21	1	订单 1 已支付	2026-11-08 17:48:49.450347+08
bulk-22	1	订单 1 已支付	2026-11-08 17:48:49.450461+08
bulk-23	1	订单 1 已支付	2026-11-08 17:48:49.451122+08
bulk-24	1	订单 1 已支付	2026-11-08 17:48:49.451227+08
bulk-25	1	订单 1 已支付	2026-11-08 17:48:49.451932+08
bulk-26	1	订单 1 已支付	2026-11-08 17:48:49.452046+08
bulk-27	1	订单 1 已支付	2026-11-08 17:48:49.452736+08
bulk-28	1	订单 1 已支付	2026-11-08 17:48:49.452964+08
bulk-29	1	订单 1 已支付	2026-11-08 17:48:49.453633+08
bulk-30	1	订单 1 已支付	2026-11-08 17:48:49.45425+08
bulk-3	1	订单 1 已支付	2026-11-08 17:48:49.551608+08
bulk-4	1	订单 1 已支付	2026-11-08 17:48:49.605799+08
bulk-5	1	订单 1 已支付	2026-11-08 17:48:49.651101+08
bulk-6	1	订单 1 已支付	2026-11-08 17:48:49.691203+08
bulk-7	1	订单 1 已支付	2026-11-08 17:48:49.740078+08
bulk-8	1	订单 1 已支付	2026-11-08 17:48:49.779281+08
bulk-9	1	订单 1 已支付	2026-11-08 17:48:49.823754+08
bulk-10	1	订单 1 已支付	2026-11-08 17:48:49.864318+08
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: p03; Owner: -
--

COPY p03.order_items (order_id, sku, title, unit_price, qty) FROM stdin;
1	mq-sku	MQ 商品	100	1
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: p03; Owner: -
--

COPY p03.orders (id, user_id, idem_key, request_hash, sku, qty, unit_price, amount, status, created_at, paid_at, cancelled_at) FROM stdin;
1	mq-user	mq-order-1	d559ac7ca035b4385a99fc7ba1dfe3f04c6bfa895c66dec470f64d2c52865b95	mq-sku	1	100	100	paid	2026-11-08 17:48:48.601762+08	2026-11-08 17:48:48.611237+08	\N
\.


--
-- Data for Name: outbox; Type: TABLE DATA; Schema: p03; Owner: -
--

COPY p03.outbox (event_id, type, payload, status, attempts, created_at, sent_at) FROM stdin;
mq-paid-1	order.paid	{"amount": 100, "user_id": "mq-user", "event_id": "mq-paid-1", "order_id": 1}	sent	1	2026-11-08 17:48:48.611237+08	2026-11-08 17:48:48.616367+08
\.


--
-- Data for Name: payment_events; Type: TABLE DATA; Schema: p03; Owner: -
--

COPY p03.payment_events (event_id, order_id, result, applied, note, received_at) FROM stdin;
mq-paid-1	1	success	t	paid	2026-11-08 17:48:48.611237+08
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: p03; Owner: -
--

COPY p03.schema_migrations (filename, applied_at) FROM stdin;
001_init.sql	2026-11-07 21:54:30.616181+08
002_outbox.sql	2026-11-07 22:33:01.843633+08
\.


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: p03; Owner: -
--

SELECT pg_catalog.setval('p03.orders_id_seq', 1, true);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (sku);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (event_id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (order_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_user_id_idem_key_key; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.orders
    ADD CONSTRAINT orders_user_id_idem_key_key UNIQUE (user_id, idem_key);


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.outbox
    ADD CONSTRAINT outbox_pkey PRIMARY KEY (event_id);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (event_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: outbox_pending_idx; Type: INDEX; Schema: p03; Owner: -
--

CREATE INDEX outbox_pending_idx ON p03.outbox USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: notifications notifications_order_id_fkey; Type: FK CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.notifications
    ADD CONSTRAINT notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES p03.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES p03.orders(id) ON DELETE CASCADE;


--
-- Name: payment_events payment_events_order_id_fkey; Type: FK CONSTRAINT; Schema: p03; Owner: -
--

ALTER TABLE ONLY p03.payment_events
    ADD CONSTRAINT payment_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES p03.orders(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict AVMuYkIrq8JYgmrhdEDYhij0aRa14037H96U7hVKNbmbpfuEG14Og0791eH6Xvn

