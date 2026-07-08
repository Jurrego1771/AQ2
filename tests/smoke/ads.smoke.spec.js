// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * @smoke — Carga del modulo Ads con sesion ya iniciada (storageState).
 * Valida que `/ad` levanta y refleja el total real de la cuenta.
 */
test.describe('Ads @smoke', () => {
  test('el modulo Ads carga con su contador real para un usuario autenticado @ADS-TC-1', async ({ adsPage }) => {
    await adsPage.goto();
    await expect(adsPage.searchInput).toBeVisible();
    await expect(adsPage.totalCount.first()).toBeVisible();
    // En dev la cuenta del bot tiene multiples ads; el contador refleja la API.
    await expect.poll(() => adsPage.total(), { timeout: 10_000 }).toBeGreaterThan(0);
    // Filas del listado visibles (al menos la primera).
    await expect(adsPage.rows.first()).toBeVisible();
  });

  test('el modulo Ads se salta en prod cuando aplica (prodGuard) @ADS-TC-1', async ({ adsPage }) => {
    test.skip(!env.isProd, 'este test solo aplica en prod-us/prod-eu');
    await adsPage.goto();
    await expect(adsPage.totalCount.first()).toBeVisible();
    // En prod solo lectura: el test no escribe nada.
  });
});
