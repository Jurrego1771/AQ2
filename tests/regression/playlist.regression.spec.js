// @ts-check
const { test, expect } = require('../../src/fixtures');
const { ResourceCleaner } = require('../../src/fixtures/resource-cleaner');
const { sm } = require('../../src/utils/selectors');
const { env } = require('../../src/utils/env');

/**
 * Regresión UI — Playlist: estructura del form y navegación (@regression @playlist).
 *
 * Cobertura UI estructural (tipo, acciones, panel en /media) MÁS la captura de
 * campos direccionable por la escalera de selectores estables (sm: -> data-name):
 * el checkbox 'Use for reels' (PR sm2#8076) se cubre vía data-name aunque aún no
 * tenga marca sm: (bug #38, deuda de testabilidad que no bloquea cobertura).
 *
 * Prueba VIVA (test.fail):
 *  - #37 el breadcrumb/ruta /playlist devuelve 404 (back-link roto).
 */
test.describe('Playlist UI — form y navegación @regression @playlist', () => {
  test('el form /playlist/new renderiza el selector de tipo y las acciones save/delete @PLST-TC-5', async ({
    playlistPage,
  }) => {
    await playlistPage.goto('new');
    await expect(playlistPage.playlistType).toBeVisible();
    await expect(playlistPage.save).toBeVisible();
    await expect(playlistPage.deleteBtn).toBeVisible();
  });

  test('el panel de Playlists está disponible en /media @PLST-TC-6', async ({ playlistPage }) => {
    await playlistPage.gotoMedia();
    // El listado carga por XHR tras la toolbar -> poll en lugar de aserción one-shot.
    await expect
      .poll(() => playlistPage.playlistList.count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  // --- PR sm2#8076: checkbox 'Use for reels' (PLST-AC-11), capa UI ---
  // Cubierto vía data-name (bug #38: sin marca sm:). Verificado en vivo (dev,
  // form v7.0.71): marcar el checkbox, guardar y RECARGAR -> sigue marcado, y el
  // detalle por API expone uses_reels:true. Escritura self-contained: la playlist
  // creada por UI se borra por API en un teardown idempotente.
  test('el checkbox "Use for reels" persiste tras guardar y recargar @PLST-TC-11', async ({
    playlistPage,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
    const cleaner = new ResourceCleaner(api);
    try {
      await playlistPage.goto('new');
      await playlistPage.fillName(`[QA-AUTO] reels-ui ${Date.now()}`);
      await playlistPage.setUsesReels(true);
      await playlistPage.saveForm();

      // Tras crear con éxito, la ruta pasa de /playlist/new a /playlist/<id>.
      await playlistPage.page.waitForURL(/\/playlist\/[a-f0-9]{24}$/i, { timeout: 15_000 });
      const id = playlistPage.page.url().split('/').pop();
      cleaner.register('playlist', id);

      // Recargar desde cero y confirmar que el checkbox sigue marcado.
      await playlistPage.page.reload();
      await expect
        .poll(() => playlistPage.usesReels.isChecked(), { timeout: 10_000 })
        .toBe(true);
    } finally {
      await cleaner.clean();
    }
  });

  // --- Prueba viva del bug #37 ---
  // El breadcrumb "Playlist" (y la ruta directa /playlist) llevan a una página
  // 404 que no renderiza ninguna marca sm: — en particular falta el chrome de la
  // app (nav-header-media). Una ruta válida siempre lo muestra. Roja-esperada
  // hasta que /playlist resuelva a una vista real.
  test('la ruta /playlist debe resolver a una vista válida, no a un 404 [BUG #37] @PLST-TC-7', async ({
    page,
  }) => {
    test.fail(
      true,
      'BUG #37: /playlist y el breadcrumb "Playlist" devuelven 404 — https://github.com/Jurrego1771/AQ2/issues/37'
    );
    await page.goto('/playlist');
    await expect(
      page.locator(sm('nav-header-media')),
      'una ruta válida renderiza el chrome de la app; el 404 no tiene marcas sm'
    ).toBeVisible();
  });
});
