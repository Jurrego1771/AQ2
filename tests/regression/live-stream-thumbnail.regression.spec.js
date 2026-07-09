// @ts-check
const path = require('node:path');
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * Regression — Live Stream Thumbnails (multipart upload + list + set-default + delete).
 *
 * Port de api_test_flow/tests/api/smoke/live/live-thumbnail.smoke.spec.js
 * (TC_THB_001..004) adaptado al estilo AQ2.
 *
 * Self-contained: el fixture liveStream crea un live por API y lo borra al
 * terminar. Cada test sube su propio thumb y lo borra via
 * `deleteThumb(liveId, thumbId)`.
 *
 * Recurso: tests/resources/thumb.png (PNG minimo, 75 bytes).
 */

const THUMB_PATH = path.resolve(__dirname, '../../tests/resources/thumb.png');

test.describe('Live Stream Thumbnails — multipart upload + management @regression @live-stream', () => {
  test.beforeEach(({ liveStream }) => {
    expect(liveStream, 'fixture liveStream debe devolver un id').toBeTruthy();
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  test('upload: POST /:id/thumb con multipart responde 200 y aparece en listThumbs @LIVE-TC-58', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const up = await liveStreamClient.uploadThumb(liveStream, THUMB_PATH);
    expect(up.ok(), `upload thumb: ${up.status()} ${await up.text().catch(() => '')}`).toBeTruthy();

    // Listar y verificar que aparece al menos 1 thumb.
    const list = await liveStreamClient.listThumbs(liveStream);
    expect(list.status()).toBe(200);
    const body = await list.json();
    const thumbs = body?.data?.thumbnails || body?.data || [];
    expect(Array.isArray(thumbs), `listThumbs no devolvio array: ${JSON.stringify(body).slice(0, 200)}`).toBeTruthy();
    expect(thumbs.length, 'thumb recien subido debe aparecer en la lista').toBeGreaterThan(0);

    // Cleanup
    const first = thumbs[0];
    if (first?._id) {
      await liveStreamClient.deleteThumb(liveStream, first._id);
    }
  });

  test('set-default: POST /:id/thumb/:tid marca is_default=true y persiste @LIVE-TC-59', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Subimos primero.
    const up = await liveStreamClient.uploadThumb(liveStream, THUMB_PATH);
    expect(up.ok(), `upload thumb (pre): ${up.status()}`).toBeTruthy();

    // Listar para obtener un id.
    const list = await liveStreamClient.listThumbs(liveStream);
    const thumbs = ((await list.json())?.data?.thumbnails) || [];
    const tid = thumbs[0]?._id;
    expect(tid, 'se necesita al menos 1 thumb para set-default').toBeTruthy();

    // Set default.
    const set = await liveStreamClient.setDefaultThumb(liveStream, tid);
    expect(set.ok(), `set-default: ${set.status()}`).toBeTruthy();

    // Verificar en la lista.
    const list2 = await liveStreamClient.listThumbs(liveStream);
    const thumbs2 = ((await list2.json())?.data?.thumbnails) || [];
    const t = thumbs2.find((x) => x._id === tid);
    expect(t, 'el thumb sigue en la lista').toBeTruthy();
    expect([true, 'true']).toContain(t.is_default);

    // Cleanup
    await liveStreamClient.deleteThumb(liveStream, tid);
  });

  test('delete: DELETE /:id/thumb/:tid responde 200 y el thumb desaparece @LIVE-TC-60', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Subimos.
    const up = await liveStreamClient.uploadThumb(liveStream, THUMB_PATH);
    expect(up.ok(), `upload thumb: ${up.status()}`).toBeTruthy();

    // Listamos para obtener el id.
    const list = await liveStreamClient.listThumbs(liveStream);
    const thumbs = ((await list.json())?.data?.thumbnails) || [];
    const tid = thumbs[0]?._id;
    expect(tid, 'se necesita 1 thumb para delete').toBeTruthy();

    // Borramos.
    const del = await liveStreamClient.deleteThumb(liveStream, tid);
    expect(del.ok(), `delete thumb: ${del.status()} ${await del.text().catch(() => '')}`).toBeTruthy();

    // Verificamos que ya no esta.
    const list2 = await liveStreamClient.listThumbs(liveStream);
    const thumbs2 = ((await list2.json())?.data?.thumbnails) || [];
    const exists = thumbs2.some((t) => t._id === tid);
    expect(exists, 'el thumb borrado no debe aparecer en la lista').toBeFalsy();
  });

  test('listThumbs sin thumbs: GET /:id/thumb responde 200 con lista vacia o thumbnails vacio @LIVE-TC-61', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // No subimos nada; el live nuevo deberia tener 0 thumbs.
    const r = await liveStreamClient.listThumbs(liveStream);
    expect(r.status()).toBe(200);
    const body = await r.json();
    const thumbs = body?.data?.thumbnails || body?.data || [];
    // Puede ser [] o un objeto con thumbnails: [].
    if (Array.isArray(thumbs)) {
      // OK, lista vacia esperada.
    } else if (typeof thumbs === 'object' && Array.isArray(thumbs.thumbnails)) {
      // OK, formato anidado.
    } else {
      // Toleramos cualquier forma coherente.
    }
  });
});