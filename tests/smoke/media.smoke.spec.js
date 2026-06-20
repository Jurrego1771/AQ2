// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * @smoke — carga del módulo Media con sesión ya iniciada (storageState).
 * Los smoke validan que cada módulo crítico levanta, no la lógica fina.
 */
test.describe('Media @smoke', () => {
  test('el módulo Media carga para un usuario autenticado @MED-TC-001', async ({ mediaPage }) => {
    await mediaPage.goto();
    await expect(mediaPage.toolbar).toBeVisible();
    // total-medias aparece duplicado en el DOM (smell del producto); first() evita
    // el strict mode. La señal funcional real: el listado trae al menos una card.
    await expect(mediaPage.totalCount.first()).toBeVisible();
    expect(await mediaPage.count()).toBeGreaterThan(0);
  });
});
