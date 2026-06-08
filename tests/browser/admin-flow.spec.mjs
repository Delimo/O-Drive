import { expect, test } from '@playwright/test';

const username = process.env.ODRIVE_ADMIN_USERNAME || 'admin';
const password = process.env.ODRIVE_ADMIN_PASSWORD || 'admin-secret';

test('admin login opens file manager and admin console', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '登录' }).click();
  await page.locator('#adminUser').fill(username);
  await page.locator('#adminPass').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('link', { name: '管理' })).toBeVisible();

  await page.getByRole('link', { name: '管理' }).click();
  await expect(page.getByRole('heading', { name: '管理控制台' })).toBeVisible();
  await page.getByRole('button', { name: '系统状态' }).click();
  await expect(page.getByRole('button', { name: '重建文件索引' })).toBeVisible();
});

test('protected path lockout shows retry message', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    window.__unlockAttempts = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      if (String(url).includes('/api/access/unlock')) {
        window.__unlockAttempts += 1;
        if (window.__unlockAttempts >= 5) {
          return new Response(JSON.stringify({ success: false, message: 'Too many attempts', retryAfter: 3 }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '3' },
          });
        }
        return new Response(JSON.stringify({ success: false, message: 'Invalid password' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, init);
    };
  });

  await page.evaluate(() => {
    window.state = window.state || {};
    window.Actions.handlePasswordRequired({ path: '/private' }, () => {});
  });
  await expect(page.locator('#unlockModal')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.locator('#unlockPasswordInput').fill('bad');
    await page.getByRole('button', { name: '解锁' }).click();
  }
  await expect(page.locator('#unlockError')).toContainText('后重试');
});
