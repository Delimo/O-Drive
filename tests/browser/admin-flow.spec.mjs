import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env.ODRIVE_BASE_URL || 'http://127.0.0.1:8788' });

test('admin maintenance panel shows all 6 action buttons in mock mode', async ({ page }) => {
  await page.goto('/admin?mock=1');
  await expect(page.getByText('后台概览')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: '维护' }).click();
  const maintSection = page.locator('section').filter({ hasText: '维护操作' }).last();
  await expect(maintSection.getByText('重建文件索引')).toBeVisible({ timeout: 10000 });
  await expect(maintSection.getByText('清理访问记录')).toBeVisible();
  await expect(maintSection.getByText('清理缩略图缓存')).toBeVisible();
  await expect(maintSection.getByText('清理旧操作日志')).toBeVisible();
  await expect(maintSection.getByText('清理已完成任务')).toBeVisible();
  await expect(maintSection.getByText('确认系统提醒')).toBeVisible();
});

test('admin health check panel shows mock data', async ({ page }) => {
  await page.goto('/admin?mock=1');
  await expect(page.getByText('后台概览')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: '系统' }).click();
  await expect(page.getByText('系统健康')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('存储服务运行正常')).toBeVisible();
});

test('admin share management shows mock share list', async ({ page }) => {
  await page.goto('/admin?mock=1');
  await expect(page.getByText('后台概览')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: '分享' }).click();
  await expect(page.getByText('分享管理')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.latest-item-compact').filter({ hasText: '产品说明.pdf' }).first()).toBeVisible();
  await expect(page.locator('.latest-item-compact').filter({ hasText: '内部文档.docx' }).first()).toBeVisible();
});
