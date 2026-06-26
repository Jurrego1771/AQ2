// @ts-check
const { test, expect } = require('../../src/fixtures');

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
});
