DROP SCHEMA IF EXISTS sql50 CASCADE;
CREATE SCHEMA sql50;
SET search_path TO sql50;

CREATE TABLE teams (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL, team_id int NOT NULL REFERENCES teams(id));
CREATE TABLE tasks (
  id int PRIMARY KEY, team_id int NOT NULL REFERENCES teams(id),
  owner_id int NOT NULL REFERENCES users(id), title text NOT NULL,
  status text NOT NULL CHECK (status IN ('todo','doing','done')),
  priority int NOT NULL CHECK (priority BETWEEN 1 AND 5),
  created_at timestamp NOT NULL
);
CREATE TABLE orders (
  id int PRIMARY KEY, user_id int NOT NULL REFERENCES users(id),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL, created_at timestamp NOT NULL
);
CREATE UNIQUE INDEX users_name_uq ON users(name);
CREATE INDEX tasks_team_status_idx ON tasks(team_id, status);
