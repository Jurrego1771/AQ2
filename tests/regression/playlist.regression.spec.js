// @ts-check
const { test, expect } = require('../../src/fixtures');
const { sm } = require('../../src/utils/selectors');

/**
 * Regresión UI — Playlist: estructura del form y navegación (@regression @playlist).
 *
 * La cobertura UI es estructural por diseño: los campos de captura del form no
 * exponen marcas sm: (bug #38), así que se protege lo que SÍ es direccionable:
 * el selector de tipo, las acciones save/delete y el panel de playlists en /media.
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
