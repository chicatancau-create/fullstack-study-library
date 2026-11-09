import { test, expect } from '@playwright/test';

const PASSWORD = 'correct-horse-1';

test('注册→建组织→建客户→写跟进带提醒→后台任务出现', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'P04 多租户 SaaS 控制台' })).toBeVisible();
  await page.getByLabel('邮箱').fill('e2e-owner@example.com');
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '注册并登录' }).click();

  await expect(page.getByRole('heading', { name: '我的组织' })).toBeVisible();
  await page.getByLabel('新组织名称').fill('E2E 团队');
  await page.getByRole('button', { name: '创建组织' }).click();
  await expect(page.getByRole('button', { name: /E2E 团队/ })).toBeVisible();

  await page.getByLabel('客户名称').fill('E2E 客户');
  await page.getByRole('button', { name: '添加客户' }).click();
  await expect(page.getByText('E2E 客户')).toBeVisible();

  await page.getByRole('button', { name: '新增跟进' }).click();
  await page.getByLabel('跟进内容').fill('电话回访');
  const tomorrow = new Date(Date.now() + 86_400_000);
  const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T09:00`;
  await page.getByLabel('提醒时间（可选）').fill(local);
  await page.getByRole('button', { name: '保存跟进' }).click();
  await expect(page.getByText('跟进 1 条')).toBeVisible();

  await page.getByRole('button', { name: '后台任务' }).click();
  await expect(page.getByRole('cell', { name: 'reminder' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'pending' })).toBeVisible();

  await page.getByRole('button', { name: '审计' }).click();
  await expect(page.getByRole('cell', { name: 'followup.create' })).toBeVisible();
});

test('viewer 只读：界面禁用写操作', async ({ page, request }) => {
  const base = 'http://localhost:4185/api';
  const register = (email: string) => request.post(`${base}/auth/register`, { data: { email, name: email.split('@')[0], password: PASSWORD } });
  const login = async (email: string) => (await (await request.post(`${base}/auth/login`, { data: { email, password: PASSWORD } })).json()).token as string;

  await register('e2e-owner2@example.com');
  await register('e2e-viewer@example.com');
  const owner = await login('e2e-owner2@example.com');
  const viewer = await login('e2e-viewer@example.com');
  const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

  const tenant = await (await request.post(`${base}/tenants`, { headers: { authorization: `Bearer ${owner}` }, data: { name: '只读团队', plan: 'team' } })).json();
  await request.post(`${base}/tenants/${tenant.id}/clients`, { headers: { authorization: `Bearer ${owner}` }, data: { name: '只读客户' } });
  const invitation = await (await request.post(`${base}/tenants/${tenant.id}/invitations`, { headers: { authorization: `Bearer ${owner}` }, data: { email: 'e2e-viewer@example.com', role: 'viewer' } })).json();
  const accepted = await request.post(`${base}/invitations/accept`, { headers: { authorization: `Bearer ${viewer}` }, data: { token: invitation.token } });
  expect(accepted.status()).toBe(200);

  await page.goto('/');
  await page.evaluate((token) => localStorage.setItem('p04.token', token), viewer);
  await page.reload();
  await expect(page.getByRole('button', { name: /只读团队/ })).toBeVisible();
  await page.getByRole('button', { name: /只读团队/ }).click();
  await expect(page.getByText('viewer 角色为只读，可查看客户但无法写入。')).toBeVisible();
  await expect(page.getByRole('button', { name: '添加客户' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '新增跟进' })).toBeDisabled();
  expect(auth).toBeTruthy();
});
