// @ts-check
const { test, expect } = require('../../src/fixtures');
const { ResourceCleaner } = require('../../src/fixtures/resource-cleaner');
const { createLiveStream } = require('../../src/api/live-stream-factory');
const { env } = require('../../src/utils/env');

/**
 * API — Prueba del fixture de limpieza (@api). Verifica que ResourceCleaner
 * realmente borra los recursos registrados (deleter live-stream), de modo que
 * los tests self-contained no dejen basura en el entorno compartido.
 */
test.describe('ResourceCleaner — limpieza de recursos @api', () => {
  // Crea un live real -> no se ejecuta contra prod (prodGuard).
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  test('clean() borra un live-stream registrado y es idempotente @LIVE-TC-14', async ({
    api,
    liveStreamClient,
  }) => {
    // Crea un recurso REAL y regístralo en el cleaner.
    const cleaner = new ResourceCleaner(api);
    const id = await createLiveStream(api, { name: `[QA-AUTO] cleaner-test ${Date.now()}` });
    cleaner.register('live-stream', id);

    // Existe antes de limpiar.
    expect((await liveStreamClient.getById(id)).status()).toBe(200);

    // clean() lo borra.
    await cleaner.clean();
    await expect
      .poll(() => liveStreamClient.getById(id).then((r) => r.status()), { timeout: 10_000 })
      .toBe(404);

    // Idempotente: limpiar de nuevo (404 = ya no existe) no rompe ni lanza.
    await cleaner.clean();
    expect((await liveStreamClient.getById(id)).status()).toBe(404);
  });
});
