import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env.ODRIVE_BASE_URL || 'http://127.0.0.1:8788' });

const fileItem = {
  token: 'file-token',
  path: 'docs/product.pdf',
  name: '产品说明.pdf',
  size: 1024,
  sizeFormatted: '1 KB',
  contentType: 'application/pdf',
  targetType: 'file',
  allowPreview: true,
  allowDownload: true,
  expiresAt: Date.now() + 86400000,
};

test('share page opens a public file share', async ({ page }) => {
  await page.route('**/api/share/file-token/info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, item: fileItem }),
  }));

  await page.goto('/share.html?token=file-token');
  await expect(page.getByRole('heading', { name: '产品说明.pdf' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: /下载/ })).toBeVisible();
});

test('share page unlocks a password protected share', async ({ page }) => {
  let unlocked = false;
  await page.route('**/api/share/password-token/**', async route => {
    const request = route.request();
    if (request.url().endsWith('/unlock')) {
      const payload = request.postDataJSON();
      unlocked = payload.password === '123456';
      await route.fulfill({
        status: unlocked ? 200 : 403,
        contentType: 'application/json',
        body: JSON.stringify(unlocked
          ? { success: true }
          : { success: false, message: '密码错误' }),
      });
      return;
    }
    await route.fulfill({
      status: unlocked ? 200 : 403,
      contentType: 'application/json',
      body: JSON.stringify(unlocked
        ? { success: true, item: { ...fileItem, token: 'password-token' } }
        : { success: false, code: 'SHARE_PASSWORD_REQUIRED', message: '需要密码' }),
    });
  });

  await page.goto('/share.html?token=password-token');
  await expect(page.getByRole('heading', { name: '此分享需要密码' })).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('输入访问密码').fill('123456');
  await page.getByRole('button', { name: /解锁/ }).click();
  await expect(page.getByRole('heading', { name: '产品说明.pdf' })).toBeVisible({ timeout: 10000 });
});

test('share page browses a shared folder', async ({ page }) => {
  await page.route('**/api/share/folder-token/info**', async route => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') || '';
    const directory = path === '项目'
      ? {
          path,
          folders: [],
          files: [{ name: '计划.md', fullKey: '团队资料/项目/计划.md', size: 128, sizeFormatted: '128 B', contentType: 'text/markdown' }],
        }
      : {
          path: '',
          folders: [{ name: '项目', fullKey: '团队资料/项目' }],
          files: [{ name: '说明.txt', fullKey: '团队资料/说明.txt', size: 64, sizeFormatted: '64 B', contentType: 'text/plain' }],
        };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: {
          token: 'folder-token',
          path: '团队资料',
          name: '团队资料',
          targetType: 'folder',
          allowPreview: true,
          allowDownload: true,
          expiresAt: Date.now() + 86400000,
        },
        directory,
      }),
    });
  });

  await page.goto('/share.html?token=folder-token');
  await expect(page.getByRole('heading', { name: '团队资料' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('link', { name: '项目' }).click();
  await expect(page.getByText('计划.md')).toBeVisible({ timeout: 10000 });
});
