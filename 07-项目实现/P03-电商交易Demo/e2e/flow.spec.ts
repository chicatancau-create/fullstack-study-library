import { test, expect } from '@playwright/test';

test('下单→支付→发货→完成→退款全链路', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'P03 电商交易 Demo' })).toBeVisible();
  await page.getByRole('button', { name: '下单' }).click();
  await expect(page.getByText('pending_payment').first()).toBeVisible();

  await page.getByRole('button', { name: '支付' }).first().click();
  await expect(page.getByText('paid').first()).toBeVisible();

  await page.getByRole('button', { name: '发货' }).first().click();
  await expect(page.getByText('shipped').first()).toBeVisible();

  await page.getByRole('button', { name: '完成' }).first().click();
  await expect(page.getByText('completed').first()).toBeVisible();

  await page.getByRole('button', { name: '退款' }).first().click();
  await expect(page.getByText('refunded').first()).toBeVisible();

  await page.getByRole('button', { name: '详情' }).click();
  await expect(page.getByText('退款：')).toBeVisible();
});
