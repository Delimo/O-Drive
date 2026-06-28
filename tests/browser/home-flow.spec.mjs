import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env.ODRIVE_BASE_URL || 'http://127.0.0.1:8788' });

test('home explorer mock mode loads and filters files', async ({ page }) => {
  await page.goto('/?mock=1');

  const explorer = page.locator('#explorerCard');
  await expect(explorer).toBeVisible({ timeout: 15000 });
  await expect(explorer.locator('[data-action="open-entry"][data-key="banner.png"]')).toBeVisible();
  await expect(explorer.locator('[data-action="open-entry"][data-key="readme.md"]')).toBeVisible();

  await page.locator('[data-role="search-input"]').fill('banner');

  await expect(explorer.locator('[data-action="open-entry"][data-key="banner.png"]')).toBeVisible({ timeout: 10000 });
  await expect(explorer.locator('[data-action="open-entry"][data-key="readme.md"]')).toHaveCount(0, { timeout: 10000 });
});
