// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * Regresión — Listado de Media: filtros y paginación (@regression @media).
 * Verde = comportamiento correcto protegido. test.fail() = prueba viva del bug #11.
 * Comportamiento validado en vivo contra dev.platform.mediastre.am.
 */
test.describe('Media list — filtros y paginación @regression @media', () => {
  test.beforeEach(async ({ mediaPage }) => {
    await mediaPage.goto();
    await mediaPage.items.first().waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('filtrar por tipo Video reduce el listado y marca el chip activo @MED-TC-007', async ({
    mediaPage,
  }) => {
    const before = Number(await mediaPage.totalText());
    await mediaPage.filterByType('video');
    await expect.poll(() => mediaPage.totalText().then(Number), { timeout: 10_000 }).toBeLessThan(
      before
    );
    expect(await mediaPage.isTypeFilterActive('video')).toBeTruthy();
  });

  test('quitar el filtro restaura el listado completo @MED-TC-008', async ({ mediaPage }) => {
    const baseline = await mediaPage.totalText();
    await mediaPage.filterByType('video');
    await expect.poll(() => mediaPage.totalText(), { timeout: 10_000 }).not.toBe(baseline);
    await mediaPage.filterByType('video'); // toggle off
    await expect.poll(() => mediaPage.totalText(), { timeout: 10_000 }).toBe(baseline);
    expect(await mediaPage.isTypeFilterActive('video')).toBeFalsy();
  });

  test('cambiar items por página a 48 muestra más de una página de 12 @MED-TC-009', async ({
    mediaPage,
  }) => {
    await mediaPage.setPerPage(48);
    await expect.poll(() => mediaPage.count(), { timeout: 10_000 }).toBeGreaterThan(12);
    expect(await mediaPage.count()).toBeLessThanOrEqual(48);
  });

  test('Next avanza skip en la URL y muestra el resto @MED-TC-010', async ({ mediaPage, page }) => {
    await mediaPage.setPerPage(48);
    await expect.poll(() => mediaPage.count(), { timeout: 10_000 }).toBeGreaterThan(12);

    const total = Number(await mediaPage.totalText());
    test.skip(total <= 48, 'no hay segunda página con 48 por página');

    await mediaPage.nextPage();
    await expect.poll(() => mediaPage.skip(), { timeout: 10_000 }).toBe(48);
    expect(page.url()).toContain('skip=48');
    // El skip en la URL se actualiza antes de que rendericen las cards de la
    // página 2; se espera a que el conteo refleje el resto.
    await expect.poll(() => mediaPage.count(), { timeout: 10_000 }).toBe(total - 48);
  });

  // --- Prueba viva del bug de estado en URL (#11) ---
  test('el filtro activo se refleja en la URL [BUG #11] @MED-TC-011', async ({ mediaPage, page }) => {
    test.fail(true, 'BUG #11: filtros no van en la URL — https://github.com/Jurrego1771/AQ2/issues/11');

    await mediaPage.filterByType('video');
    await expect.poll(() => mediaPage.isTypeFilterActive('video'), { timeout: 10_000 }).toBeTruthy();

    const { search, hash } = new URL(page.url());
    expect((search + hash).toLowerCase()).toContain('video');
  });
});
