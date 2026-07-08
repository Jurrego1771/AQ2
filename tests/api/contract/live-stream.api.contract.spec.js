// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');
const { ResourceCleaner } = require('../../../src/fixtures/resource-cleaner');
const {
  createLiveStreamResponseSchema,
  getLiveStreamResponseSchema,
  listLiveStreamResponseSchema,
} = require('../../../src/schemas/live-stream.schema');

/**
 * @api — Contrato HTTP del recurso Live Stream.
 * Cubre POST/GET/list. Sub-resources (thumb/logo/schedule) tienen su propio spec.
 */
test.describe('Live Stream API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard');

  test('LIVE-TC-CRT POST /api/live-stream/ devuelve Create Response valido @LIVE-TC-CRT', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    // Endpoint real: POST /api/live-stream/  (con trailing slash, NO /api/live-stream).
    // Lo verificamos en vivo durante la sesion de ads (createAd de tipo 'local' fallo
    // hasta que corregimos al endpoint con slash literal en src/api/live-stream.client.js).
    const payload = {
      name: `[QA-CONTRACT] Live-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      type: 'video',
    };
    const res = await api.post('/api/live-stream/', { data: payload });
    expect(res.status(), `POST /api/live-stream/ fallo: ${await res.text()}`).toBe(200);
    const body = await res.json();
    const parsed = createLiveStreamResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    cleaner.register('live-stream', parsed.data.data._id);
  });

  test('LIVE-TC-GET GET /api/live-stream/:id devuelve Get Response valido @LIVE-TC-GET', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    const create = await api.post('/api/live-stream/', {
      data: { name: `[QA-CONTRACT] LiveGet-${Date.now()}`, type: 'video' },
    });
    expect(create.status()).toBe(200);
    const created = await create.json();
    const id = created?.data?._id;
    expect(id).toBeTruthy();
    cleaner.register('live-stream', id);

    const res = await api.get(`/api/live-stream/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = getLiveStreamResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(parsed.data.data._id).toBe(id);
  });

  test('LIVE-TC-LST GET /api/live-stream (list) devuelve List Response valido @LIVE-TC-LST', async ({ api }) => {
    const res = await api.get('/api/live-stream', { params: { limit: 5 } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = listLiveStreamResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(Array.isArray(parsed.data.data)).toBe(true);
  });

  test('LIVE-TC-404 GET /api/live-stream/:fake_id devuelve 404 @LIVE-TC-404', async ({ api }) => {
    const res = await api.get('/api/live-stream/000000000000000000000000');
    expect(res.status(), `GET live-stream inexistente deberia 404`).toBe(404);
  });
});
