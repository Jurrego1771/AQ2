// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * Regresión UI — Live Editor: testabilidad/UX de la toolbar del timeline
 * (@regression @live-editor). No depende de buffer DVR (atributos estáticos del DOM).
 *
 * Pruebas VIVAS (test.fail) de hallazgos filados en exploración:
 *  - #29 zoomIn/zoomOut sin nombre accesible ni foco por teclado (WCAG 4.1.2/2.1.1).
 *  - #30 typo en title de move-forward ("Move selection rigth").
 */
test.describe('Live Editor UI — toolbar del timeline @regression @live-editor', () => {
  // Live de video real con ingesta (provisto por el equipo; no se modifica).
  const VIDEO_LIVE_ID = '6a15a4e5a23b8b92586beb63';

  test.beforeEach(async ({ liveEditorPage }) => {
    await liveEditorPage.goto(VIDEO_LIVE_ID);
  });

  // --- Prueba viva del bug #29 ---
  // zoomIn/zoomOut son <div class="glyphicon ..."> sin title/aria-label/role ni
  // tabindex: sin nombre accesible y fuera del orden de tabulación. Roja-esperada
  // hasta que se corrija el issue.
  test('los controles de zoom deben exponer nombre accesible [BUG #29] @LEDT-TC-7', async ({
    liveEditorPage,
  }) => {
    test.fail(
      true,
      'BUG #29: zoomIn/zoomOut sin nombre accesible ni foco — https://github.com/Jurrego1771/AQ2/issues/29'
    );
    const accName = (loc) =>
      loc.evaluate(
        (el) => el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim()
      );
    expect(await accName(liveEditorPage.zoomIn), 'zoomIn sin nombre accesible').not.toBe('');
    expect(await accName(liveEditorPage.zoomOut), 'zoomOut sin nombre accesible').not.toBe('');
  });

  // --- Prueba viva del bug #30 ---
  // move-forward tiene title="Move selection rigth" (typo). Su par move-backward
  // está bien ("Move selection left"). Roja-esperada hasta que se corrija.
  test('el title de move-forward no debe tener el typo "rigth" [BUG #30] @LEDT-TC-8', async ({
    liveEditorPage,
  }) => {
    test.fail(
      true,
      'BUG #30: title="Move selection rigth" — https://github.com/Jurrego1771/AQ2/issues/30'
    );
    const title = await liveEditorPage.moveForward.getAttribute('title');
    expect(title, 'el title de move-forward debe estar bien escrito ("right")').toBe(
      'Move selection right'
    );
  });

  // Positivo a proteger: el par bien escrito y el resto de la toolbar con nombre.
  test('move-backward expone un title correcto @LEDT-TC-9', async ({ liveEditorPage }) => {
    await expect(liveEditorPage.moveBackward).toHaveAttribute('title', 'Move selection left');
  });
});
