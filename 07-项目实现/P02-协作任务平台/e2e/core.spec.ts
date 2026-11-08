import { test, expect } from '@playwright/test';

const email = `e2e-${Date.now()}@example.com`;

test('注册→建工作区→建任务→改状态→评论，刷新后仍在', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: '没有账号？去注册' }).click();
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByRole('heading', { name: '我的工作区' })).toBeVisible();

  await page.getByLabel('新工作区名称').fill('E2E 团队');
  await page.getByRole('button', { name: '创建工作区' }).click();
  await page.getByRole('link', { name: 'E2E 团队' }).click();

  await page.getByLabel('新任务标题').fill('写验收用例');
  await page.getByRole('button', { name: '创建任务' }).click();
  await page.getByRole('link', { name: '写验收用例' }).click();

  await page.getByLabel('任务状态').selectOption('in_progress');
  await expect(page.getByLabel('任务状态')).toHaveValue('in_progress');

  await page.getByLabel('新评论').fill('第一条评论');
  await page.getByRole('button', { name: '发表评论' }).click();
  await expect(page.getByText('第一条评论')).toBeVisible();

  await page.reload();
  await expect(page.getByText('第一条评论')).toBeVisible();
  await expect(page.getByLabel('任务状态')).toHaveValue('in_progress');
});

test('空表单提交显示校验错误', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByText('请输入有效邮箱')).toBeVisible();
  await expect(page.getByText('密码至少 8 位')).toBeVisible();
});
