export type User = { id: string; email: string; name: string };
export type Workspace = { id: string; name: string; role: 'owner' | 'admin' | 'member' };
export type Task = { id: string; workspaceId: string; title: string; status: 'todo' | 'in_progress' | 'done'; version: number };
export type Comment = { id: string; taskId: string; authorId: string; body: string; createdAt: string };

type Session = { accessToken: string; refreshToken: string; user?: User };

const KEY = 'p02.session';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function readSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null) {
  if (session) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
}

async function raw(path: string, init: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, body.error || 'ERROR', body.message || res.statusText);
  return body;
}

let refreshing: Promise<Session | null> | null = null;

async function refreshSession(): Promise<Session | null> {
  const current = readSession();
  if (!current?.refreshToken) return null;
  if (!refreshing) {
    refreshing = raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) })
      .then((body) => {
        const next = { ...current, accessToken: body.accessToken, refreshToken: body.refreshToken };
        writeSession(next);
        return next;
      })
      .catch(() => {
        writeSession(null);
        window.dispatchEvent(new Event('p02:session-expired'));
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = readSession();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
  try {
    return await raw(path, { ...init, headers });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && session && retry) {
      const next = await refreshSession();
      if (next) return request<T>(path, init, false);
      throw new ApiError(401, 'SESSION_EXPIRED', '会话已过期，请重新登录');
    }
    throw error;
  }
}

export const api = {
  register: (payload: { email: string; password: string; name?: string }) =>
    raw('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    raw('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  workspaces: () => request<{ workspaces: Workspace[] }>('/workspaces'),
  createWorkspace: (name: string) =>
    request<{ workspace: Workspace }>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  tasks: (workspaceId: string) => request<{ tasks: Task[] }>(`/workspaces/${workspaceId}/tasks`),
  createTask: (workspaceId: string, title: string) =>
    request<{ task: Task }>(`/workspaces/${workspaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title }) }),
  task: (taskId: string) => request<{ task: Task }>(`/tasks/${taskId}`),
  updateTask: (taskId: string, status: Task['status']) =>
    request<{ task: Task }>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  comments: (taskId: string) => request<{ comments: Comment[] }>(`/tasks/${taskId}/comments`),
  addComment: (taskId: string, body: string) =>
    request<{ comment: Comment }>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
};
