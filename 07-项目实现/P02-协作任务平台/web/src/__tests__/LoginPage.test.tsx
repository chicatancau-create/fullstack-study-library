import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import { AuthProvider } from '../auth';
import { api } from '../api';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, login: vi.fn(), register: vi.fn() },
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => localStorage.clear());

  it('空提交显示字段校验', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(screen.getByText('请输入有效邮箱')).toBeInTheDocument();
    expect(screen.getByText('密码至少 8 位')).toBeInTheDocument();
  });

  it('登录失败显示服务端错误', async () => {
    (api.login as any).mockRejectedValueOnce(new (await import('../api')).ApiError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误'));
    renderPage();
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('密码'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
  });

  it('登录成功写入会话', async () => {
    (api.login as any).mockResolvedValueOnce({
      accessToken: 'a', refreshToken: 'r', user: { id: '1', email: 'a@b.com', name: 'a' },
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('密码'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(JSON.parse(localStorage.getItem('p02.session') || '{}').accessToken).toBe('a');
  });
});
