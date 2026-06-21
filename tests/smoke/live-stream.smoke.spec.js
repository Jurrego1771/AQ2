// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * @smoke — carga del módulo Live Stream con sesión ya iniciada (storageState).
 * Los smoke validan que el módulo levanta, no la lógica fina.
 */
test.describe('Live Stream @smoke', () => {
  test('el módulo Live carga para un usuario autenticado @LIVE-TC-1', async ({ liveStreamPage }) => {
    await liveStreamPage.goto();
    await expect(liveStreamPage.searchInput).toBeVisible();
    await expect(liveStreamPage.totalCount.first()).toBeVisible();
    // El listado de dev tiene eventos; el contador refleja el total real (>0).
    await expect.poll(() => liveStreamPage.total(), { timeout: 10_000 }).toBeGreaterThan(0);
  });
});
