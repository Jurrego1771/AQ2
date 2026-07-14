// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * Regresión P0 — Búsqueda de Media (@regression @media).
 *
 * Verde = comportamiento correcto que debemos proteger.
 * test.fail() = prueba viva de un bug conocido: el test asserta el comportamiento
 *   CORRECTO y Playwright lo espera en rojo. Cuando el bug se arregle, el test
 *   empezará a pasar y el runner marcará "expected to fail but passed" -> señal
 *   para quitar el marcador. Issues: #1 y #2.
 */
test.describe('Media search @regression @media', () => {
  test.beforeEach(async ({ mediaPage }) => {
    await mediaPage.goto();
  });

  test('filtra el listado a títulos que contienen el término @MED-TC-002', async ({ mediaPage }) => {
    const term = await mediaPage.firstResultToken();
    expect(term, 'no se pudo derivar un término del primer resultado').toBeTruthy();

    await mediaPage.search(String(term));
    await expect.poll(() => mediaPage.count(), { timeout: 10_000 }).toBeGreaterThan(0);

    // El término aparece en los resultados (some, no every: los títulos largos
    // se truncan con "…" en la card y el término puede quedar fuera del texto visible).
    const titles = await mediaPage.visibleTitles();
    expect(titles.some((title) => title.toLowerCase().includes(String(term)))).toBeTruthy();
  });

  test('muestra el estado vacío para un término sin coincidencias @MED-TC-003', async ({ mediaPage }) => {
    await mediaPage.search(`zzqa_${Date.now()}_nomatch`);
    await expect(mediaPage.emptyState).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => mediaPage.count(), { timeout: 10_000 }).toBe(0);
  });

  test('limpiar la búsqueda restaura el listado completo @MED-TC-004', async ({ mediaPage }) => {
    const baseline = await mediaPage.totalText();

    await mediaPage.search(`zzqa_${Date.now()}_nomatch`);
    await expect(mediaPage.emptyState).toBeVisible({ timeout: 10_000 });

    await mediaPage.clearSearch();
    await expect.poll(() => mediaPage.count(), { timeout: 10_000 }).toBeGreaterThan(0);
    // totalText se actualiza async tras restaurar; poll evita flakiness bajo carga.
    await expect.poll(() => mediaPage.totalText(), { timeout: 10_000 }).toBe(baseline);
  });

  // --- Pruebas vivas de bugs conocidos (se ejecutan, esperadas en rojo) ---

  test('el contador muestra 0 en una búsqueda sin resultados [BUG #1] @MED-TC-005', async ({ mediaPage }) => {
    test.fail(true, 'BUG #1: el contador queda obsoleto — https://github.com/Jurrego1771/AQ2/issues/1');

    const term = await mediaPage.firstResultToken();
    await mediaPage.search(String(term)); // >=1 resultado, fija el contador
    await mediaPage.search(`zzqa_${Date.now()}_x`); // 0 resultados
    await expect(mediaPage.emptyState).toBeVisible();

    expect(await mediaPage.totalText()).toBe('0');
  });

  test('el término de búsqueda se refleja en la URL [BUG #2] @MED-TC-006', async ({ mediaPage, page }) => {
    test.fail(true, 'BUG #2: la búsqueda no va en la URL — https://github.com/Jurrego1771/AQ2/issues/2');

    const term = await mediaPage.firstResultToken();
    await mediaPage.search(String(term));
    await expect.poll(() => mediaPage.count(), { timeout: 10_000 }).toBeGreaterThan(0);

    // Solo query+hash (no el path: "/media" contendría "media" y daría falso positivo).
    const { search, hash } = new URL(page.url());
    expect((search + hash).toLowerCase()).toContain(String(term));
  });
});
