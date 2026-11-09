import { expect, test } from '@playwright/test';

test('真实路由快速切换：慢 A 晚到不得覆盖快 B', async ({ page }) => {
  await page.route('**/api/items*', async (route) => {
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('filter');
    await new Promise((resolve) => setTimeout(resolve, filter === 'a' ? 800 : 50));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(filter === 'a' ? [{ id: 1, title: 'A 记录' }] : [{ id: 2, title: 'B 记录' }]),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '路由 A' }).click();
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: '路由 B' }).click();

  await expect(page.getByLabel('route-items')).toContainText('B 记录');
  await page.waitForTimeout(1000);
  await expect(page.getByLabel('route-items')).not.toContainText('A 记录');
  await expect(page.getByLabel('route-events')).toContainText('apply:b');
  await expect(page.getByLabel('route-events')).not.toContainText('apply:a');
  await expect(page.getByRole('button', { name: '路由 B' })).toHaveAttribute('aria-pressed', 'true');
});
