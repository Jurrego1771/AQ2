// @ts-check
const path = require('node:path');
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');

/**
 * Regression — Live Stream Logo (multipart upload + position + delete).
 *
 * Port de api_test_flow/tests/api/regression/live/live-logo.regression.spec.js
 * adaptado al estilo AQ2: storageState, liveStreamClient + fixture liveStream,
 * ResourceCleaner, qaName, y nuestro BaseClient.postMultipart (en lugar del
 * wrapper ApiClient externo).
 *
 * Self-contained: el fixture liveStream crea un live por API y lo borra al
 * terminar. El logo es sub-recurso del live, se borra via `deleteLogo()` al
 * final del test (no se necesita registrar en el cleaner por separado).
 *
 * Recurso: tests/resources/logo.png (PNG minimo, 75 bytes).
 */

const LOGO_PATH = path.resolve(__dirname, '../../tests/resources/logo.png');

test.describe('Live Stream Logo — multipart upload + persistence @regression @live-stream', () => {
  test.beforeEach(({ liveStream }) => {
    expect(liveStream, 'fixture liveStream debe devolver un id').toBeTruthy();
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  test('upload: POST /:id/logo con multipart responde 200 y persiste el flag enabled @LIVE-TC-54', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.uploadLogo(liveStream, LOGO_PATH);
    expect(r.ok(), `upload logo: ${r.status()} ${await r.text().catch(() => '')}`).toBeTruthy();

    // Verificacion: el flag `logo.live.enabled` debe estar en true y la url
    // debe contener el id del live. Toleramos estructura si la app usa
    // paths diferentes segun la version.
    const get = await liveStreamClient.getById(liveStream);
    expect(get.status()).toBe(200);
    const body = await get.json();
    const d = body.data || {};
    const enabled = d.logo?.live?.enabled ?? d.logo?.enabled ?? d.logoEnabled;
    expect([true, 'true']).toContain(enabled);

    // Cleanup
    await liveStreamClient.deleteLogo(liveStream);
  });

  test('position: update logo_live_position responde 2xx/4xx esperable @LIVE-TC-55', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Subimos primero para que el campo position tenga contexto.
    const up = await liveStreamClient.uploadLogo(liveStream, LOGO_PATH);
    expect(up.ok(), `upload logo (pre): ${up.status()}`).toBeTruthy();

    // Update del position via POST /:id (form).
    const r = await liveStreamClient.update(liveStream, { logo_live_position: 'bottom-left' });
    expect(
      [200, 400].includes(r.status()),
      `update logo_live_position: ${r.status()}`
    ).toBeTruthy();

    // Cleanup
    await liveStreamClient.deleteLogo(liveStream);
  });

  test('delete: DELETE /:id/logo responde 200/204/404 (404 = ya no hay logo) @LIVE-TC-56', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Subimos primero.
    const up = await liveStreamClient.uploadLogo(liveStream, LOGO_PATH);
    expect(up.ok(), `upload logo: ${up.status()}`).toBeTruthy();

    // Borramos.
    const del = await liveStreamClient.deleteLogo(liveStream);
    expect(
      [200, 204, 404].includes(del.status()),
      `delete logo: ${del.status()} ${await del.text().catch(() => '')}`
    ).toBeTruthy();

    // Idempotente: un segundo delete debe seguir dando 200/204/404.
    const del2 = await liveStreamClient.deleteLogo(liveStream);
    expect([200, 204, 404].includes(del2.status()), `delete logo (2nd): ${del2.status()}`).toBeTruthy();
  });

  test('upload: rechaza file invalido con 4xx/5xx (no 200) @LIVE-TC-57', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Subimos un .txt disfrazado: el server debe rechazarlo.
    // (Verifica validacion de Content-Type en el server.)
    const fake = {
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello, this is not a logo'),
    };
    const r = await liveStreamClient.uploadLogo(liveStream, fake);
    // No esperamos 200: el server debe detectar formato invalido.
    expect(
      r.status() !== 200,
      `upload de .txt devolvio 200 (no deberia): ${r.status()}`
    ).toBeTruthy();
  });
});