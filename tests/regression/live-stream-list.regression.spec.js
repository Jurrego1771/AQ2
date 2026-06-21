// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * Regresión — Listado de Live Stream: filtros de tipo y búsqueda
 * (@regression @live-stream). Verde = comportamiento correcto protegido.
 * Comportamiento verificado en vivo contra dev.platform.mediastre.am:
 *   total=79, type=video→77, type=audio→2 (77+2=79), query=Radio→1.
 * El conteo se lee del contador `total-live-streams` (señal estable entre los
 * 3 layouts; la marca de card vive solo en grid).
 */
test.describe('Live Stream list — filtros y búsqueda @regression @live-stream', () => {
  test.beforeEach(async ({ liveStreamPage }) => {
    await liveStreamPage.goto();
    await expect.poll(() => liveStreamPage.total(), { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('filtrar por Audio reduce el listado y marca el chip activo @LIVE-TC-2', async ({
    liveStreamPage,
  }) => {
    const before = await liveStreamPage.total();
    await liveStreamPage.filterByType('audio');
    await expect.poll(() => liveStreamPage.total(), { timeout: 10_000 }).toBeLessThan(before);
    expect(await liveStreamPage.isTypeFilterActive('audio')).toBeTruthy();
  });

  test('filtrar por Video reduce y volver a togglear restaura el listado @LIVE-TC-3', async ({
    liveStreamPage,
  }) => {
    const baseline = await liveStreamPage.total();
    await liveStreamPage.filterByType('video');
    await expect.poll(() => liveStreamPage.total(), { timeout: 10_000 }).toBeLessThan(baseline);
    await liveStreamPage.filterByType('video'); // toggle off
    await expect.poll(() => liveStreamPage.total(), { timeout: 10_000 }).toBe(baseline);
    expect(await liveStreamPage.isTypeFilterActive('video')).toBeFalsy();
  });

  test('una búsqueda sin coincidencias vacía el listado y limpiarla lo restaura @LIVE-TC-4', async ({
    liveStreamPage,
  }) => {
    const baseline = await liveStreamPage.total();
    await liveStreamPage.search('zzz-no-such-live-zzz');
    await expect.poll(() => liveStreamPage.total(), { timeout: 10_000 }).toBe(0);
    await liveStreamPage.clearSearch();
    await expect.poll(() => liveStreamPage.total(), { timeout: 10_000 }).toBe(baseline);
  });
});
