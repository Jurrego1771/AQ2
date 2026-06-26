// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * Regresión UI — Live Editor: flujo de corte de clips (@regression @live-editor).
 *
 * Protege el comportamiento correcto del corte (verificado en vivo, dev v7.0.67):
 * cortar un clip lo agrega a la lista y habilita "New Media"; borrarlo lo quita.
 * Y la guarda de "cut-out sin cut-in" que evita un clip inválido.
 *
 * Depende de buffer DVR (ingesta activa + retención). Si el editor no queda listo
 * (sin buffer), el test se salta en vez de fallar en falso. El corte es 100%
 * client-side (sessionStorage): NO crea media ni recursos en el server.
 */
test.describe('Live Editor — flujo de corte de clips @regression @live-editor', () => {
  // Live de video real con ingesta (provisto por el equipo; no se modifica).
  const VIDEO_LIVE_ID = '6a15a4e5a23b8b92586beb63';

  test.beforeEach(async ({ liveEditorPage }) => {
    await liveEditorPage.goto(VIDEO_LIVE_ID);
    const ready = await liveEditorPage.waitReady();
    test.skip(!ready, 'editor sin buffer DVR disponible (player no listo)');
    // Estado limpio: sin clips previos en sessionStorage.
    await liveEditorPage.clearStoredClips(VIDEO_LIVE_ID);
    await liveEditorPage.page.reload();
    await liveEditorPage.editorLive.waitFor({ state: 'visible' });
    await liveEditorPage.waitReady();
  });

  test('cortar un clip lo agrega a la lista y habilita New Media; borrarlo lo quita @LEDT-TC-11', async ({
    liveEditorPage,
  }) => {
    // Pre: sin clips, mensaje visible, New Media deshabilitado.
    await expect(liveEditorPage.clipItems).toHaveCount(0);
    await expect(liveEditorPage.createMedia).toBeDisabled();

    // Cortar un clip de ~2 min dentro de la ventana DVR.
    await liveEditorPage.cutClipBetween(20, 22);

    await expect.poll(() => liveEditorPage.clipItems.count()).toBe(1);
    await expect(liveEditorPage.createMedia).toBeEnabled();

    // Borrar el clip -> vuelve al estado vacío.
    await liveEditorPage.firstClipDelete.click();
    await expect.poll(() => liveEditorPage.clipItems.count()).toBe(0);
    await expect(liveEditorPage.createMedia).toBeDisabled();
  });

  test('cortar dos clips acumula la duración total (suma) @LEDT-TC-13', async ({
    liveEditorPage,
  }) => {
    await expect(liveEditorPage.clipItems).toHaveCount(0);

    // Primer clip de ~2 min.
    await liveEditorPage.cutClipBetween(10, 12);
    await expect.poll(() => liveEditorPage.clipItems.count()).toBe(1);
    const afterFirst = await liveEditorPage.mainDurationSec();
    expect(afterFirst, 'la duración total tras 1 clip debe ser > 0').toBeGreaterThan(0);

    // Segundo clip de ~2 min en otra ventana del DVR.
    await liveEditorPage.cutClipBetween(20, 22);
    await expect.poll(() => liveEditorPage.clipItems.count()).toBe(2);
    const afterSecond = await liveEditorPage.mainDurationSec();

    // La total acumula: tras el 2º clip es mayor, y el incremento ≈ el 2º corte
    // (~120 s pedido; tolerancia por alineación de frames del DVR).
    expect(afterSecond, 'la duración total debe crecer al sumar el 2º clip').toBeGreaterThan(
      afterFirst
    );
    expect(afterSecond - afterFirst, 'el incremento debe reflejar el 2º clip (~2 min)').toBeGreaterThan(
      60
    );
    expect(afterSecond - afterFirst).toBeLessThan(180);
  });

  test('cut-out sin cut-in no crea clip (guarda de selección) @LEDT-TC-12', async ({
    liveEditorPage,
  }) => {
    await expect(liveEditorPage.clipItems).toHaveCount(0);

    // Posicionar el scrubber y pulsar SOLO cut-out (o), sin cut-in (i) previo.
    await liveEditorPage.seekToOffset(20);
    await liveEditorPage.pressShortcut('o');
    await liveEditorPage.pressShortcut('c');

    // No debe agregarse ningún clip ni habilitarse New Media.
    await expect(liveEditorPage.clipItems).toHaveCount(0);
    await expect(liveEditorPage.createMedia).toBeDisabled();
  });
});
