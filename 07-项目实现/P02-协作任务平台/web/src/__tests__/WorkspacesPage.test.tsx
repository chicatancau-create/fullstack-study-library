import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkspacesPage from '../pages/WorkspacesPage';
import { AuthProvider } from '../auth';
import { ApiError, api } from '../api';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, workspaces: vi.fn(), createWorkspace: vi.fn() },
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <WorkspacesPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('WorkspacesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('加载中显示状态', () => {
    (api.workspaces as any).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('加载中');
  });

  it('空列表提示创建', async () => {
    (api.workspaces as any).mockResolvedValue({ workspaces: [] });
    renderPage();
    expect(await screen.findByText('还没有工作区，先创建一个。')).toBeInTheDocument();
  });

  it('403 显示无权限', async () => {
    (api.workspaces as any).mockRejectedValue(new ApiError(403, 'FORBIDDEN', '无权'));
    renderPage();
    expect(await screen.findByText('你没有访问权限')).toBeInTheDocument();
  });

  it('渲染工作区列表与角色', async () => {
    (api.workspaces as any).mockResolvedValue({ workspaces: [{ id: 'w1', name: '团队', role: 'owner' }] });
    renderPage();
    expect(await screen.findByRole('link', { name: '团队' })).toHaveAttribute('href', '/workspaces/w1');
    expect(screen.getByText('owner')).toBeInTheDocument();
  });
});
