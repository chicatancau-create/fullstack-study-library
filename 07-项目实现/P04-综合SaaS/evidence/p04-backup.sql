--
-- PostgreSQL database dump
--

\restrict GUUq5X4XZ8dnh0SaJT1L3W42kov6H2mrvda2xjxGex7F4ekptTbXgZ0UbDsLjAX

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
-- Name: p04; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA p04;


--
-- Name: fail_audit(); Type: FUNCTION; Schema: p04; Owner: -
--

CREATE FUNCTION p04.fail_audit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_events; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.audit_events (
    id bigint NOT NULL,
    tenant_id integer NOT NULL,
    actor_id integer NOT NULL,
    action text NOT NULL,
    target text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_events_id_seq; Type: SEQUENCE; Schema: p04; Owner: -
--

CREATE SEQUENCE p04.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: p04; Owner: -
--

ALTER SEQUENCE p04.audit_events_id_seq OWNED BY p04.audit_events.id;


--
-- Name: clients; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.clients (
    id integer NOT NULL,
    tenant_id integer NOT NULL,
    name text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: p04; Owner: -
--

CREATE SEQUENCE p04.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: p04; Owner: -
--

ALTER SEQUENCE p04.clients_id_seq OWNED BY p04.clients.id;


--
-- Name: followups; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.followups (
    id integer NOT NULL,
    tenant_id integer NOT NULL,
    client_id integer NOT NULL,
    author_id integer NOT NULL,
    summary text NOT NULL,
    next_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: followups_id_seq; Type: SEQUENCE; Schema: p04; Owner: -
--

CREATE SEQUENCE p04.followups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: followups_id_seq; Type: SEQUENCE OWNED BY; Schema: p04; Owner: -
--

ALTER SEQUENCE p04.followups_id_seq OWNED BY p04.followups.id;


--
-- Name: invitations; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.invitations (
    id integer NOT NULL,
    tenant_id integer NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text]))),
    CONSTRAINT invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: invitations_id_seq; Type: SEQUENCE; Schema: p04; Owner: -
--

CREATE SEQUENCE p04.invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: p04; Owner: -
--

ALTER SEQUENCE p04.invitations_id_seq OWNED BY p04.invitations.id;


--
-- Name: job_results; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.job_results (
    job_id bigint NOT NULL,
    result text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: jobs; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.jobs (
    id bigint NOT NULL,
    tenant_id integer NOT NULL,
    kind text NOT NULL,
    dedupe_key text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: p04; Owner: -
--

CREATE SEQUENCE p04.jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: p04; Owner: -
--

ALTER SEQUENCE p04.jobs_id_seq OWNED BY p04.jobs.id;


--
-- Name: memberships; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.memberships (
    tenant_id integer NOT NULL,
    user_id integer NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.sessions (
    token_hash text NOT NULL,
    user_id integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.tenants (
    id integer NOT NULL,
    name text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    seat_limit integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'team'::text]))),
    CONSTRAINT tenants_seat_limit_check CHECK ((seat_limit > 0))
);


--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: p04; Owner: -
--

CREATE SEQUENCE p04.tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: p04; Owner: -
--

ALTER SEQUENCE p04.tenants_id_seq OWNED BY p04.tenants.id;


--
-- Name: users; Type: TABLE; Schema: p04; Owner: -
--

CREATE TABLE p04.users (
    id integer NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: p04; Owner: -
--

CREATE SEQUENCE p04.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: p04; Owner: -
--

ALTER SEQUENCE p04.users_id_seq OWNED BY p04.users.id;


--
-- Name: audit_events id; Type: DEFAULT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.audit_events ALTER COLUMN id SET DEFAULT nextval('p04.audit_events_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.clients ALTER COLUMN id SET DEFAULT nextval('p04.clients_id_seq'::regclass);


--
-- Name: followups id; Type: DEFAULT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.followups ALTER COLUMN id SET DEFAULT nextval('p04.followups_id_seq'::regclass);


--
-- Name: invitations id; Type: DEFAULT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.invitations ALTER COLUMN id SET DEFAULT nextval('p04.invitations_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.jobs ALTER COLUMN id SET DEFAULT nextval('p04.jobs_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.tenants ALTER COLUMN id SET DEFAULT nextval('p04.tenants_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.users ALTER COLUMN id SET DEFAULT nextval('p04.users_id_seq'::regclass);


--
-- Data for Name: audit_events; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.audit_events (id, tenant_id, actor_id, action, target, metadata, created_at) FROM stdin;
1	1	1	tenant.create	tenant:1	{"plan": "team"}	2026-11-08 17:51:01.346662+08
3	1	1	client.delete	client:1	{}	2026-11-08 17:51:01.365144+08
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.clients (id, tenant_id, name, note, deleted_at, created_at) FROM stdin;
1	1	待删客户		2026-11-08 17:51:01.365144+08	2026-11-08 17:51:01.351057+08
\.


--
-- Data for Name: followups; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.followups (id, tenant_id, client_id, author_id, summary, next_at, created_at) FROM stdin;
\.


--
-- Data for Name: invitations; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.invitations (id, tenant_id, email, role, token_hash, status, expires_at, created_by, created_at, accepted_at) FROM stdin;
\.


--
-- Data for Name: job_results; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.job_results (job_id, result, created_at) FROM stdin;
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.jobs (id, tenant_id, kind, dedupe_key, payload, run_at, status, attempts, locked_at, last_error, created_at, updated_at) FROM stdin;
1	97	followup.reminder	am-ext-1	{}	2026-11-08 12:18:49.717139+08	pending	0	\N	\N	2026-11-08 12:18:49.717139+08	2026-11-08 12:18:49.717139+08
2	97	followup.reminder	am-ext-2	{}	2026-11-08 12:18:49.71943+08	pending	0	\N	\N	2026-11-08 12:18:49.71943+08	2026-11-08 12:18:49.71943+08
3	97	followup.reminder	am-ext-3	{}	2026-11-08 12:18:49.720042+08	pending	0	\N	\N	2026-11-08 12:18:49.720042+08	2026-11-08 12:18:49.720042+08
4	97	followup.reminder	am-ext-4	{}	2026-11-08 12:18:49.720953+08	pending	0	\N	\N	2026-11-08 12:18:49.720953+08	2026-11-08 12:18:49.720953+08
5	97	followup.reminder	am-ext-5	{}	2026-11-08 12:18:49.721569+08	pending	0	\N	\N	2026-11-08 12:18:49.721569+08	2026-11-08 12:18:49.721569+08
6	97	followup.reminder	am-ext-6	{}	2026-11-08 12:18:49.722161+08	pending	0	\N	\N	2026-11-08 12:18:49.722161+08	2026-11-08 12:18:49.722161+08
7	97	followup.reminder	am-ext-7	{}	2026-11-08 12:18:49.722606+08	pending	0	\N	\N	2026-11-08 12:18:49.722606+08	2026-11-08 12:18:49.722606+08
8	97	followup.reminder	am-ext-8	{}	2026-11-08 12:18:49.723147+08	pending	0	\N	\N	2026-11-08 12:18:49.723147+08	2026-11-08 12:18:49.723147+08
9	97	followup.reminder	am-ext-9	{}	2026-11-08 12:18:49.723714+08	pending	0	\N	\N	2026-11-08 12:18:49.723714+08	2026-11-08 12:18:49.723714+08
10	97	followup.reminder	am-ext-10	{}	2026-11-08 12:18:49.724711+08	pending	0	\N	\N	2026-11-08 12:18:49.724711+08	2026-11-08 12:18:49.724711+08
11	97	followup.reminder	am-ext-11	{}	2026-11-08 12:18:49.72526+08	pending	0	\N	\N	2026-11-08 12:18:49.72526+08	2026-11-08 12:18:49.72526+08
12	97	followup.reminder	am-ext-12	{}	2026-11-08 12:18:49.725666+08	pending	0	\N	\N	2026-11-08 12:18:49.725666+08	2026-11-08 12:18:49.725666+08
13	97	followup.reminder	am-ext-13	{}	2026-11-08 12:18:49.726155+08	pending	0	\N	\N	2026-11-08 12:18:49.726155+08	2026-11-08 12:18:49.726155+08
14	97	followup.reminder	am-ext-14	{}	2026-11-08 12:18:49.726708+08	pending	0	\N	\N	2026-11-08 12:18:49.726708+08	2026-11-08 12:18:49.726708+08
15	97	followup.reminder	am-ext-15	{}	2026-11-08 12:18:49.727242+08	pending	0	\N	\N	2026-11-08 12:18:49.727242+08	2026-11-08 12:18:49.727242+08
16	97	followup.reminder	am-ext-16	{}	2026-11-08 12:18:49.728004+08	pending	0	\N	\N	2026-11-08 12:18:49.728004+08	2026-11-08 12:18:49.728004+08
17	97	followup.reminder	am-ext-17	{}	2026-11-08 12:18:49.72849+08	pending	0	\N	\N	2026-11-08 12:18:49.72849+08	2026-11-08 12:18:49.72849+08
18	97	followup.reminder	am-ext-18	{}	2026-11-08 12:18:49.728943+08	pending	0	\N	\N	2026-11-08 12:18:49.728943+08	2026-11-08 12:18:49.728943+08
19	97	followup.reminder	am-ext-19	{}	2026-11-08 12:18:49.729341+08	pending	0	\N	\N	2026-11-08 12:18:49.729341+08	2026-11-08 12:18:49.729341+08
20	97	followup.reminder	am-ext-20	{}	2026-11-08 12:18:49.729769+08	pending	0	\N	\N	2026-11-08 12:18:49.729769+08	2026-11-08 12:18:49.729769+08
21	97	followup.reminder	am-ext-21	{}	2026-11-08 12:18:49.730142+08	pending	0	\N	\N	2026-11-08 12:18:49.730142+08	2026-11-08 12:18:49.730142+08
22	97	followup.reminder	am-ext-22	{}	2026-11-08 12:18:49.730731+08	pending	0	\N	\N	2026-11-08 12:18:49.730731+08	2026-11-08 12:18:49.730731+08
23	97	followup.reminder	am-ext-23	{}	2026-11-08 12:18:49.731268+08	pending	0	\N	\N	2026-11-08 12:18:49.731268+08	2026-11-08 12:18:49.731268+08
24	97	followup.reminder	am-ext-24	{}	2026-11-08 12:18:49.731751+08	pending	0	\N	\N	2026-11-08 12:18:49.731751+08	2026-11-08 12:18:49.731751+08
25	97	followup.reminder	am-ext-25	{}	2026-11-08 12:18:49.732265+08	pending	0	\N	\N	2026-11-08 12:18:49.732265+08	2026-11-08 12:18:49.732265+08
26	97	followup.reminder	am-ext-26	{}	2026-11-08 12:18:49.732755+08	pending	0	\N	\N	2026-11-08 12:18:49.732755+08	2026-11-08 12:18:49.732755+08
27	97	followup.reminder	am-ext-27	{}	2026-11-08 12:18:49.73329+08	pending	0	\N	\N	2026-11-08 12:18:49.73329+08	2026-11-08 12:18:49.73329+08
28	97	followup.reminder	am-ext-28	{}	2026-11-08 12:18:49.733812+08	pending	0	\N	\N	2026-11-08 12:18:49.733812+08	2026-11-08 12:18:49.733812+08
29	97	followup.reminder	am-ext-29	{}	2026-11-08 12:18:49.734694+08	pending	0	\N	\N	2026-11-08 12:18:49.734694+08	2026-11-08 12:18:49.734694+08
30	97	followup.reminder	am-ext-30	{}	2026-11-08 12:18:49.735221+08	pending	0	\N	\N	2026-11-08 12:18:49.735221+08	2026-11-08 12:18:49.735221+08
31	97	followup.reminder	am-ext-31	{}	2026-11-08 12:18:49.735765+08	pending	0	\N	\N	2026-11-08 12:18:49.735765+08	2026-11-08 12:18:49.735765+08
32	97	followup.reminder	am-ext-32	{}	2026-11-08 12:18:49.736214+08	pending	0	\N	\N	2026-11-08 12:18:49.736214+08	2026-11-08 12:18:49.736214+08
33	97	followup.reminder	am-ext-33	{}	2026-11-08 12:18:49.736665+08	pending	0	\N	\N	2026-11-08 12:18:49.736665+08	2026-11-08 12:18:49.736665+08
34	97	followup.reminder	am-ext-34	{}	2026-11-08 12:18:49.73755+08	pending	0	\N	\N	2026-11-08 12:18:49.73755+08	2026-11-08 12:18:49.73755+08
35	97	followup.reminder	am-ext-35	{}	2026-11-08 12:18:49.738142+08	pending	0	\N	\N	2026-11-08 12:18:49.738142+08	2026-11-08 12:18:49.738142+08
36	97	followup.reminder	am-ext-36	{}	2026-11-08 12:18:49.738614+08	pending	0	\N	\N	2026-11-08 12:18:49.738614+08	2026-11-08 12:18:49.738614+08
37	97	followup.reminder	am-ext-37	{}	2026-11-08 12:18:49.739129+08	pending	0	\N	\N	2026-11-08 12:18:49.739129+08	2026-11-08 12:18:49.739129+08
38	97	followup.reminder	am-ext-38	{}	2026-11-08 12:18:49.739599+08	pending	0	\N	\N	2026-11-08 12:18:49.739599+08	2026-11-08 12:18:49.739599+08
39	97	followup.reminder	am-ext-39	{}	2026-11-08 12:18:49.740012+08	pending	0	\N	\N	2026-11-08 12:18:49.740012+08	2026-11-08 12:18:49.740012+08
40	97	followup.reminder	am-ext-40	{}	2026-11-08 12:18:49.740692+08	pending	0	\N	\N	2026-11-08 12:18:49.740692+08	2026-11-08 12:18:49.740692+08
41	97	followup.reminder	am-ext-41	{}	2026-11-08 12:18:49.741206+08	pending	0	\N	\N	2026-11-08 12:18:49.741206+08	2026-11-08 12:18:49.741206+08
42	97	followup.reminder	am-ext-42	{}	2026-11-08 12:18:49.741661+08	pending	0	\N	\N	2026-11-08 12:18:49.741661+08	2026-11-08 12:18:49.741661+08
43	97	followup.reminder	am-ext-43	{}	2026-11-08 12:18:49.742131+08	pending	0	\N	\N	2026-11-08 12:18:49.742131+08	2026-11-08 12:18:49.742131+08
44	97	followup.reminder	am-ext-44	{}	2026-11-08 12:18:49.742577+08	pending	0	\N	\N	2026-11-08 12:18:49.742577+08	2026-11-08 12:18:49.742577+08
45	97	followup.reminder	am-ext-45	{}	2026-11-08 12:18:49.743031+08	pending	0	\N	\N	2026-11-08 12:18:49.743031+08	2026-11-08 12:18:49.743031+08
46	97	followup.reminder	am-ext-46	{}	2026-11-08 12:18:49.743542+08	pending	0	\N	\N	2026-11-08 12:18:49.743542+08	2026-11-08 12:18:49.743542+08
47	97	followup.reminder	am-ext-47	{}	2026-11-08 12:18:49.744137+08	pending	0	\N	\N	2026-11-08 12:18:49.744137+08	2026-11-08 12:18:49.744137+08
48	97	followup.reminder	am-ext-48	{}	2026-11-08 12:18:49.744655+08	pending	0	\N	\N	2026-11-08 12:18:49.744655+08	2026-11-08 12:18:49.744655+08
49	97	followup.reminder	am-ext-49	{}	2026-11-08 12:18:49.745127+08	pending	0	\N	\N	2026-11-08 12:18:49.745127+08	2026-11-08 12:18:49.745127+08
50	97	followup.reminder	am-ext-50	{}	2026-11-08 12:18:49.745552+08	pending	0	\N	\N	2026-11-08 12:18:49.745552+08	2026-11-08 12:18:49.745552+08
51	97	followup.reminder	am-ext-51	{}	2026-11-08 12:18:49.745943+08	pending	0	\N	\N	2026-11-08 12:18:49.745943+08	2026-11-08 12:18:49.745943+08
52	97	followup.reminder	am-ext-52	{}	2026-11-08 12:18:49.746414+08	pending	0	\N	\N	2026-11-08 12:18:49.746414+08	2026-11-08 12:18:49.746414+08
53	97	followup.reminder	am-ext-53	{}	2026-11-08 12:18:49.74682+08	pending	0	\N	\N	2026-11-08 12:18:49.74682+08	2026-11-08 12:18:49.74682+08
54	97	followup.reminder	am-ext-54	{}	2026-11-08 12:18:49.747626+08	pending	0	\N	\N	2026-11-08 12:18:49.747626+08	2026-11-08 12:18:49.747626+08
55	97	followup.reminder	am-ext-55	{}	2026-11-08 12:18:49.748132+08	pending	0	\N	\N	2026-11-08 12:18:49.748132+08	2026-11-08 12:18:49.748132+08
56	97	followup.reminder	am-ext-56	{}	2026-11-08 12:18:49.748619+08	pending	0	\N	\N	2026-11-08 12:18:49.748619+08	2026-11-08 12:18:49.748619+08
57	97	followup.reminder	am-ext-57	{}	2026-11-08 12:18:49.749093+08	pending	0	\N	\N	2026-11-08 12:18:49.749093+08	2026-11-08 12:18:49.749093+08
58	97	followup.reminder	am-ext-58	{}	2026-11-08 12:18:49.749593+08	pending	0	\N	\N	2026-11-08 12:18:49.749593+08	2026-11-08 12:18:49.749593+08
59	97	followup.reminder	am-ext-59	{}	2026-11-08 12:18:49.750044+08	pending	0	\N	\N	2026-11-08 12:18:49.750044+08	2026-11-08 12:18:49.750044+08
60	97	followup.reminder	am-ext-60	{}	2026-11-08 12:18:49.750576+08	pending	0	\N	\N	2026-11-08 12:18:49.750576+08	2026-11-08 12:18:49.750576+08
\.


--
-- Data for Name: memberships; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.memberships (tenant_id, user_id, role, created_at) FROM stdin;
1	1	owner	2026-11-08 17:51:01.346662+08
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.schema_migrations (filename, applied_at) FROM stdin;
001_init.sql	2026-11-07 22:06:42.187378+08
002_jobs.sql	2026-11-07 23:28:35.363998+08
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.sessions (token_hash, user_id, expires_at, created_at) FROM stdin;
d67e8fb886c4d5cfa79b62c7a544bd4cff85acad99c49bf58290a0ee57d0c91d	1	2026-11-09 05:51:01.343+08	2026-11-08 17:51:01.343938+08
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.tenants (id, name, plan, seat_limit, created_at) FROM stdin;
1	团队	team	5	2026-11-08 17:51:01.346662+08
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: p04; Owner: -
--

COPY p04.users (id, email, name, password_hash, created_at) FROM stdin;
1	owner@example.com	测试用户	67fff6f317f2381a629e0772cfc139ce:3d517f027769528f71f291746df6a688e34d2ab7f60524baa3c127aab072943594bd4e753e7f376ef43447ab29ed1297107e7188871492cacf942e7f69d782a9	2026-11-08 17:51:01.314819+08
\.


--
-- Name: audit_events_id_seq; Type: SEQUENCE SET; Schema: p04; Owner: -
--

SELECT pg_catalog.setval('p04.audit_events_id_seq', 3, true);


--
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: p04; Owner: -
--

SELECT pg_catalog.setval('p04.clients_id_seq', 1, true);


--
-- Name: followups_id_seq; Type: SEQUENCE SET; Schema: p04; Owner: -
--

SELECT pg_catalog.setval('p04.followups_id_seq', 1, false);


--
-- Name: invitations_id_seq; Type: SEQUENCE SET; Schema: p04; Owner: -
--

SELECT pg_catalog.setval('p04.invitations_id_seq', 1, false);


--
-- Name: jobs_id_seq; Type: SEQUENCE SET; Schema: p04; Owner: -
--

SELECT pg_catalog.setval('p04.jobs_id_seq', 60, true);


--
-- Name: tenants_id_seq; Type: SEQUENCE SET; Schema: p04; Owner: -
--

SELECT pg_catalog.setval('p04.tenants_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: p04; Owner: -
--

SELECT pg_catalog.setval('p04.users_id_seq', 1, true);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: followups followups_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.followups
    ADD CONSTRAINT followups_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_hash_key; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.invitations
    ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: job_results job_results_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.job_results
    ADD CONSTRAINT job_results_pkey PRIMARY KEY (job_id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_tenant_id_dedupe_key_key; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.jobs
    ADD CONSTRAINT jobs_tenant_id_dedupe_key_key UNIQUE (tenant_id, dedupe_key);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (tenant_id, user_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_tenant_id_idx; Type: INDEX; Schema: p04; Owner: -
--

CREATE INDEX audit_tenant_id_idx ON p04.audit_events USING btree (tenant_id, id DESC);


--
-- Name: clients_tenant_idx; Type: INDEX; Schema: p04; Owner: -
--

CREATE INDEX clients_tenant_idx ON p04.clients USING btree (tenant_id, id) WHERE (deleted_at IS NULL);


--
-- Name: invitations_pending_email; Type: INDEX; Schema: p04; Owner: -
--

CREATE UNIQUE INDEX invitations_pending_email ON p04.invitations USING btree (tenant_id, lower(email)) WHERE (status = 'pending'::text);


--
-- Name: jobs_due_idx; Type: INDEX; Schema: p04; Owner: -
--

CREATE INDEX jobs_due_idx ON p04.jobs USING btree (run_at, id) WHERE (status = 'pending'::text);


--
-- Name: jobs_stale_idx; Type: INDEX; Schema: p04; Owner: -
--

CREATE INDEX jobs_stale_idx ON p04.jobs USING btree (locked_at) WHERE (status = 'running'::text);


--
-- Name: audit_events audit_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.audit_events
    ADD CONSTRAINT audit_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES p04.users(id);


--
-- Name: audit_events audit_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.audit_events
    ADD CONSTRAINT audit_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES p04.tenants(id) ON DELETE CASCADE;


--
-- Name: clients clients_tenant_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.clients
    ADD CONSTRAINT clients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES p04.tenants(id) ON DELETE CASCADE;


--
-- Name: followups followups_author_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.followups
    ADD CONSTRAINT followups_author_id_fkey FOREIGN KEY (author_id) REFERENCES p04.users(id);


--
-- Name: followups followups_client_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.followups
    ADD CONSTRAINT followups_client_id_fkey FOREIGN KEY (client_id) REFERENCES p04.clients(id) ON DELETE CASCADE;


--
-- Name: followups followups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.followups
    ADD CONSTRAINT followups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES p04.tenants(id) ON DELETE CASCADE;


--
-- Name: invitations invitations_created_by_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.invitations
    ADD CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES p04.users(id);


--
-- Name: invitations invitations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.invitations
    ADD CONSTRAINT invitations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES p04.tenants(id) ON DELETE CASCADE;


--
-- Name: job_results job_results_job_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.job_results
    ADD CONSTRAINT job_results_job_id_fkey FOREIGN KEY (job_id) REFERENCES p04.jobs(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.memberships
    ADD CONSTRAINT memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES p04.tenants(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES p04.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: p04; Owner: -
--

ALTER TABLE ONLY p04.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES p04.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict GUUq5X4XZ8dnh0SaJT1L3W42kov6H2mrvda2xjxGex7F4ekptTbXgZ0UbDsLjAX

