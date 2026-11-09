import pg from 'pg';

export default async function setup() {
  const client = new pg.Client({
    host: '127.0.0.1', port: 5432, user: 'study', password: 'study-pass', database: process.env.PGDATABASE || 'study_lab',
  });
  await client.connect();
  await client.query(`TRUNCATE p04.users, p04.tenants, p04.clients, p04.followups, p04.reminders, p04.jobs,
    p04.job_notifications, p04.worker_inbox, p04.job_dead_letter, p04.audit_events RESTART IDENTITY CASCADE`);
  await client.end();
}
