import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, readSession, request, writeSession } from '../api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api request', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('401 后刷新一次并重放请求', async () => {
    writeSession({ accessToken: 'old', refreshToken: 'r1', user: { id: '1', email: 'a@b.c', name: 'a' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { error: 'UNAUTHENTICATED', message: '未认证' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new', refreshToken: 'r2' }))
      .mockResolvedValueOnce(json(200, { workspaces: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await request<{ workspaces: unknown[] }>('/workspaces');
    expect(result.workspaces).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readSession()?.accessToken).toBe('new');
  });

  it('刷新失败时清空会话并派发过期事件', async () => {
    writeSession({ accessToken: 'old', refreshToken: 'r1' });
    const expired = vi.fn();
    window.addEventListener('p02:session-expired', expired);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json(401, { error: 'UNAUTHENTICATED' }))
      .mockResolvedValueOnce(json(401, { error: 'INVALID_REFRESH' })));

    await expect(request('/workspaces')).rejects.toBeInstanceOf(ApiError);
    expect(readSession()).toBeNull();
    expect(expired).toHaveBeenCalled();
  });

  it('非 401 错误直接抛出状态与消息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(403, { error: 'FORBIDDEN', message: '无权' })));
    await expect(request('/workspaces')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: '无权' });
  });
});
