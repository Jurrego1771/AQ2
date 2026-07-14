// @ts-check
const { test, expect } = require('../../../../src/fixtures');

/**
 * API — Live Stream: manejo de id inválido en endpoints del evento (@api @live-stream).
 *
 * Contrato verificado en vivo: ante un id no-ObjectId (el literal "new", que el
 * form de creación usa como segmento de ruta), los endpoints del evento deben
 * tratarlo como NOT_FOUND (404), no dejar escapar un error de DB (500).
 */
test.describe('Live Stream API — id inválido @api @live-stream', () => {
  test('GET /:id devuelve 404 NOT_FOUND para id no-ObjectId @LIVE-TC-5', async ({
    liveStreamClient,
  }) => {
    const res = await liveStreamClient.getById('new');
    expect(res.status()).toBe(404);
    expect((await res.json()).data).toBe('NOT_FOUND');
  });

  test('GET /:id/schedule-job devuelve 404 NOT_FOUND para id no-ObjectId @LIVE-TC-6', async ({
    liveStreamClient,
  }) => {
    const res = await liveStreamClient.scheduleJobs('new');
    expect(res.status()).toBe(404);
  });

  // --- Prueba viva del bug #20 ---
  // `/:id/recording` no valida el id: con "new", Mongoose lanza CastError y el
  // handler responde 500 + DB_ERROR (fuga de internals). Debe ser 404 como sus
  // endpoints hermanos. Roja-esperada hasta que se corrija el issue.
  test('GET /:id/recording NO debe responder 500 ante id inválido [BUG #20] @LIVE-TC-7', async ({
    liveStreamClient,
  }) => {
    test.fail(
      true,
      'BUG #20: /recording devuelve 500 + DB_ERROR (CastError) — https://github.com/Jurrego1771/AQ2/issues/20'
    );
    const res = await liveStreamClient.recording('new');
    expect(res.status(), 'un id inválido no debería producir 500 del servidor').not.toBe(500);
  });
});
