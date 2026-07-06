// @ts-check
const { test, expect } = require('../../src/fixtures');
const { ResourceCleaner } = require('../../src/fixtures/resource-cleaner');
const { env } = require('../../src/utils/env');

/**
 * API — Live Editor: contrato de los endpoints de clip/edición (@api @live-editor).
 *
 * El Live Editor corta clips del DVR de un evento en vivo y genera media. Estos
 * casos cubren el comportamiento de borde del contrato (entradas inválidas), que
 * NO depende de que el DVR tenga buffer. Verificado en vivo (dev v7.0.67): el
 * contrato es robusto — ningún id/body inválido filtra un 500.
 *
 * A diferencia de live-stream `/recording` (bug #20, 500 por CastError), aquí un
 * id no-ObjectId en job-status se trata como 404 — comportamiento a proteger.
 */
test.describe('Live Editor API — contrato de clips @api @live-editor', () => {
  const ABSENT_OID = '000000000000000000000000';
  // Live de video real con ingesta (provisto por el equipo; no se modifica).
  const VIDEO_LIVE_ID = '6a15a4e5a23b8b92586beb63';

  test('POST /api/editor rechaza un media inexistente con 400 INVALID_VIDEO_OBJECT @LEDT-TC-1', async ({
    editorClient,
  }) => {
    const res = await editorClient.createClip({ type: 'media', id: ABSENT_OID, url: [] });
    expect(res.status()).toBe(400);
    expect((await res.json()).data).toBe('INVALID_VIDEO_OBJECT');
  });

  test('POST /api/editor rechaza type=live (handler solo procesa media) con 400 INVALID_VIDEO_OBJECT @LEDT-TC-2', async ({
    editorClient,
  }) => {
    const res = await editorClient.createClip({ type: 'live', id: VIDEO_LIVE_ID, url: [] });
    expect(res.status()).toBe(400);
    expect((await res.json()).data).toBe('INVALID_VIDEO_OBJECT');
  });

  test('GET job-status trata un id no-ObjectId como 404 INVALID_MEDIA (no 500) @LEDT-TC-3', async ({
    editorClient,
  }) => {
    const res = await editorClient.jobStatus('notanid');
    expect(res.status(), 'un id inválido no debe filtrar un 500 de DB (contraste con #20)').toBe(
      404
    );
    expect((await res.json()).data).toBe('INVALID_MEDIA');
  });

  test('GET job-status de un ObjectId válido sin jobs responde 200 con lista vacía @LEDT-TC-4', async ({
    editorClient,
  }) => {
    const res = await editorClient.jobStatus(ABSENT_OID);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  test('POST /api/editor/create-preview valida campos requeridos con 400 BAD_REQUEST @LEDT-TC-5', async ({
    editorClient,
  }) => {
    const res = await editorClient.createPreview({});
    expect(res.status()).toBe(400);
    expect((await res.json()).data).toBe('BAD_REQUEST');
  });

  test('GET /api/live-editor/:id trata un id inválido como 404 NOT_FOUND @LEDT-TC-6', async ({
    liveEditorClient,
  }) => {
    const res = await liveEditorClient.getByLiveId('notanid');
    expect(res.status()).toBe(404);
    expect((await res.json()).data).toBe('NOT_FOUND');
  });

  // --- Prueba viva del bug #32 ---
  // POST /api/dvr no aplica el límite MAX_DURATION_HOURS: la función cutDurations
  // tiene la guarda invertida (`|| query.start`) que hace `return` del callback de
  // forEach ANTES de acumular la duración, así que totalDuration queda en 0 y todo
  // clip pasa el chequeo. Un clip de 24h (>10h máx en dev) debería responder 400 y
  // NO crear media; hoy responde 200 y crea media. Roja-esperada hasta corregir #32.
  //
  // Como el bug crea una media por corrida, la registramos en ResourceCleaner y la
  // borramos en el teardown (igual patrón que el fixture transcodedMedia). Cuando se
  // corrija, la respuesta será 400 sin mediaId y no habrá nada que limpiar.
  test('POST /api/dvr rechaza un clip que excede MAX_DURATION_HOURS [BUG #32] @LEDT-TC-10', async ({
    dvrClient,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
    test.fail(
      true,
      'BUG #32: /api/dvr no valida la duración del clip — https://github.com/Jurrego1771/AQ2/issues/32'
    );
    const cleaner = new ResourceCleaner(api);
    // Clip de 24h sobre el live de video real (supera los 10h de MAX_DURATION_HOURS).
    const overMaxClip =
      `https://dev-embed.mdstrm.com/live-stream-playlist/${VIDEO_LIVE_ID}.m3u8` +
      '?start=2026-06-26T00:00:00.000Z&end=2026-06-27T00:00:00.000Z&dvr=true';
    try {
      const res = await dvrClient.createMedia(VIDEO_LIVE_ID, { url: [overMaxClip] });
      if (res.ok()) {
        const mediaId = (await res.json())?.data?.mediaId;
        if (mediaId) cleaner.register('media', mediaId);
      }
      expect(
        res.status(),
        'un clip que excede la duración máxima debe rechazarse con 400, no crear media'
      ).toBe(400);
    } finally {
      await cleaner.clean();
    }
  });
});
