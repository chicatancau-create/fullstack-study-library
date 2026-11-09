export type Tenant = { id: number; name: string; plan: string; seat_limit: number; role: string };
export type Member = { id: number; email: string; name: string; role: string };
export type Client = { id: number; name: string; note: string; followups: number };
export type Job = { id: number; kind: string; status: string; priority: number; attempts: number; run_at: string; last_error: string };
export type Notification = { id: number; message: string; created_at: string };
export type AuditEvent = { id: number; action: string; target: string; metadata: unknown; created_at: string; actor: string };

const KEY = 'p04.token';
export const getToken = () => localStorage.getItem(KEY) || '';
export const setToken = (token: string) => {
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
};

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, body.error || 'error');
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    raw<{ token: string; user: { id: number; email: string; name: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, name: string, password: string) =>
    raw<{ id: number }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }),
  tenants: () => raw<{ tenants: Tenant[] }>('/tenants'),
  createTenant: (name: string, plan = 'team') => raw<Tenant>('/tenants', { method: 'POST', body: JSON.stringify({ name, plan }) }),
  clients: (id: number) => raw<{ clients: Client[] }>(`/tenants/${id}/clients`),
  createClient: (id: number, name: string) => raw<Client>(`/tenants/${id}/clients`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteClient: (id: number, clientId: number) => raw<void>(`/tenants/${id}/clients/${clientId}`, { method: 'DELETE' }),
  createFollowup: (id: number, clientId: number, summary: string, nextAt: string) =>
    raw<{ id: number }>(`/tenants/${id}/clients/${clientId}/followups`, {
      method: 'POST',
      body: JSON.stringify(nextAt ? { summary, next_at: nextAt } : { summary }),
    }),
  jobs: (id: number) => raw<{ jobs: Job[] }>(`/tenants/${id}/jobs`),
  createJob: (id: number, kind: string, dedupeKey: string, priority: number) =>
    raw<{ id: number }>(`/tenants/${id}/jobs`, { method: 'POST', body: JSON.stringify({ kind, dedupe_key: dedupeKey, priority }) }),
  notifications: (id: number) => raw<{ notifications: Notification[] }>(`/tenants/${id}/notifications`),
  audit: (id: number) => raw<{ events: AuditEvent[] }>(`/tenants/${id}/audit`),
  members: (id: number) => raw<{ members: Member[] }>(`/tenants/${id}/members`),
};
