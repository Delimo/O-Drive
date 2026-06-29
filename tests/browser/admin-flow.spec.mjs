import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env.ODRIVE_BASE_URL || 'http://127.0.0.1:8788' });

test('admin maintenance panel shows all 6 action buttons in mock mode', async ({ page }) => {
  await page.goto('/admin?mock=1');
  await expect(page.getByText('系统概览')).toBeVisible({ timeout: 15000 });

  await page.locator('[data-tab="system"]').click();
  const maintSection = page.locator('.ov-maintenance');
  await expect(maintSection).toBeVisible({ timeout: 10000 });
  await expect(maintSection.locator('[data-maintenance-action]')).toHaveCount(6);
  await expect(maintSection.locator('[data-maintenance-action="rebuild-index"]')).toBeVisible();
  await expect(maintSection.locator('[data-maintenance-action="clear-cache"]')).toBeVisible();
  await expect(maintSection.locator('[data-maintenance-action="purge-trash"]')).toBeVisible();
  await expect(maintSection.locator('[data-maintenance-action="cleanup-zip-task-results"]')).toBeVisible();
  await expect(maintSection.locator('[data-maintenance-action="rebuild-storage-refs"]')).toBeVisible();
  await expect(maintSection.locator('[data-maintenance-action="cleanup-orphan-storage-objects"]')).toBeVisible();
});

test('admin health check panel shows mock data', async ({ page }) => {
  await page.goto('/admin?mock=1');
  await expect(page.getByText('系统概览')).toBeVisible({ timeout: 15000 });

  await page.locator('[data-tab="system"]').click();
  await expect(page.locator('.ov-health')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.ov-health-status.ov-health-ok').first()).toBeVisible();
});

test('admin share management shows mock share list', async ({ page }) => {
  await page.goto('/admin?mock=1');
  await expect(page.getByText('系统概览')).toBeVisible({ timeout: 15000 });

  await page.locator('[data-tab="shares"]').click();
  await expect(page.locator('.ov-shares')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.ov-share-item').filter({ hasText: '产品说明.pdf' }).first()).toBeVisible();
  await expect(page.locator('.ov-share-item').filter({ hasText: '内部文档.docx' }).first()).toBeVisible();
});
