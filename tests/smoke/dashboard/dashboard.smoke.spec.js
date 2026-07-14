// @ts-check
const { test, expect } = require('@playwright/test');
const { sm } = require('../../../src/utils/selectors');

/**
 * Smoke del shell autenticado. Verifica que tras el login (storageState del
 * proyecto "setup") el dashboard carga con el nav principal y los widgets de
 * uso. Marcas validadas en vivo contra dev.platform.mediastre.am.
 */
test.describe('Dashboard shell @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('renders the primary module navigation', async ({ page }) => {
    const modules = [
      'dashboard',
      'media',
      'channel',
      'customer',
      'ad',
      'analytics',
      'live-editor',
      'ott-manager',
    ];
    for (const module of modules) {
      await expect(
        page.locator(sm(`nav-header-${module}`)),
        `falta el item de nav "${module}"`
      ).toBeVisible();
    }
  });

  test('renders the account usage widgets', async ({ page }) => {
    await expect(page.locator(sm('media-count'))).toBeVisible();
    await expect(page.locator(sm('live-count'))).toBeVisible();
    await expect(page.locator(sm('used-storage'))).toBeVisible();
    await expect(page.locator(sm('used-transfer'))).toBeVisible();
  });
});
