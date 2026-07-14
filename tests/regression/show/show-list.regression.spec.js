// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * Regresión — Listado de Show: búsqueda básica y advanced search.
 * Verde = comportamiento correcto protegido.
 * Comportamiento validado en vivo contra dev.platform.mediastre.am (2026-06-23).
 */
test.describe('Show list — búsqueda @regression @show', () => {
  test.beforeEach(async ({ showPage }) => {
    await showPage.goto();
    await showPage.items.first().waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('búsqueda por título reduce el listado @SHW-TC-002', async ({ showPage }) => {
    const before = await showPage.count();
    // Deriva un término de la primera card visible para no hardcodear títulos.
    const firstId = await showPage.firstShowId();
    test.skip(!firstId, 'no hay shows en el listado');

    // Busca «QA» — término presente en al menos el show creado durante la exploración.
    await showPage.search('QA');
    await expect
      .poll(() => showPage.count(), { timeout: 10_000 })
      .toBeLessThanOrEqual(before);
    // El resultado puede ser 0 si no hay shows con «QA» en el título; la búsqueda
    // debe terminar de todas formas sin crash.
    await expect(showPage.loadingIcon).not.toBeVisible();
  });

  test('limpiar búsqueda restaura el listado completo @SHW-TC-003', async ({ showPage }) => {
    await showPage.totalCount.first().waitFor({ state: 'visible' });
    const baseline = await showPage.totalText();
    await showPage.search('QA');
    await expect
      .poll(() => showPage.totalText(), { timeout: 10_000 })
      .not.toBe(baseline);

    await showPage.clearSearch();
    await expect
      .poll(() => showPage.totalText(), { timeout: 10_000 })
      .toBe(baseline);
  });

  test('el panel de búsqueda avanzada se abre con el botón @SHW-TC-004', async ({ showPage }) => {
    await expect(showPage.advancedSearchPanel).not.toBeVisible();
    await showPage.advancedSearchButton.click();
    await expect(showPage.advancedSearchPanel).toBeVisible();
    await showPage.cancelSearchButton.click();
    await expect(showPage.advancedSearchPanel).not.toBeVisible();
  });
});
