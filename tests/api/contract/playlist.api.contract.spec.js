// @ts-check
const { z } = require('zod');
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');
const { ResourceCleaner } = require('../../../src/fixtures/resource-cleaner');
const {
  createPlaylistResponseSchema,
  getPlaylistResponseSchema,
  listPlaylistResponseSchema,
} = require('../../../src/schemas/playlist.schema');

/**
 * @api — Contrato HTTP del recurso Playlist (sm2 vista playlists.coffee).
 * Cubre el shape de respuesta de POST/GET/list + el sub-resource GET medias.
 *
 * Portado de api_test_flow/tests/api/contract/playlist/playlist.contract.spec.js,
 * adaptado a AQ2 (cookies de admin, ResourceCleaner self-contained).
 */
test.describe('Playlist API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  test('PLST-TC-CRT POST /api/playlist devuelve Create Response valido @PLST-TC-CRT', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    // El contrato requiere `type` y el server setea account/slug/etc.
    const payload = {
      name: `[QA-CONTRACT] Playlist-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      type: 'manual',
      no_ad: false,
    };
    const res = await api.post('/api/playlist', { data: payload });
    expect(res.status(), `POST /api/playlist fallo: ${await res.text()}`).toBe(200);
    const body = await res.json();
    const parsed = createPlaylistResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    cleaner.register('playlist', parsed.data.data._id);
  });

  test('PLST-TC-GET GET /api/playlist/:id devuelve Get Response valido @PLST-TC-GET', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    const createRes = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Playlist-Get-${Date.now()}`, type: 'manual', no_ad: false },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    const id = created?.data?._id;
    expect(id).toBeTruthy();
    cleaner.register('playlist', id);

    const res = await api.get(`/api/playlist/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = getPlaylistResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(parsed.data.data._id).toBe(id);
  });

  test('PLST-TC-LST GET /api/playlist (list) devuelve List Response valido @PLST-TC-LST', async ({ api }) => {
    const res = await api.get('/api/playlist', { params: { limit: 5 } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = listPlaylistResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(Array.isArray(parsed.data.data)).toBe(true);
  });

  test('PLST-TC-MED GET /api/playlist/:id?medias=true responde 200 con envelope valido @PLST-TC-MED', async ({ api }) => {
    // En el old repo este endpoint respondia con un array de medias; en esta version de sm2
    // responde con la playlist completa + reglas (data.rules.manual.medias, etc.).
    // Conservamos el spec para detectar drift en el shape del envelope, no del contenido.
    const cleaner = new ResourceCleaner(api);
    const createRes = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Playlist-Medias-${Date.now()}`, type: 'manual', no_ad: false },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    const id = created?.data?._id;
    expect(id).toBeTruthy();
    cleaner.register('playlist', id);

    const res = await api.get(`/api/playlist/${id}`, { params: { medias: true } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Solo validamos que el envelope jsonp es valido (status + data), sin forzar
    // shape de data (porque depende de que la playlist tenga reglas, lo cual es
    // variable entre cuentas y tipos de playlist).
    const envelopeShape = z.object({
      status: z.string(),
      data: z.unknown(),
    }).passthrough();
    const parsed = envelopeShape.safeParse(body);
    expect(
      parsed.success,
      `Envelope no matchea:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}\nbody:\n${JSON.stringify(body).slice(0, 600)}`
    ).toBe(true);
  });
});
