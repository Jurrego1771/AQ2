// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const {
  createAdResponseSchema,
  getAdResponseSchema,
  listAdResponseSchema,
} = require('../../../../src/schemas/ad.schema');

/**
 * @api — Contrato HTTP del recurso Ad (sm2 vista ads.coffee / ad.coffee).
 *
 * Endpoints verificados leyendo app.js (l.2716..2735) de sm2:
 *   POST   /api/ad/new       -> alta
 *   POST   /api/ad/:ad_id    -> update (NO es PUT)
 *   GET    /api/ad           -> list (default limit=11, status=0)
 *   GET    /api/ad/:ad_id    -> detail
 *   DELETE /api/ad/:ad_id
 *
 * NOTA: el modulo Ad ya tiene cobertura UI significativa en tests/regression/
 * ads-*.regression.spec.js (smoke ADS-TC-1 + ADS-TC-2..10). Este spec de
 * contrato es la red complementaria contra drift silencioso de sm2.
 */
test.describe('Ad API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard');

  test('ADS-TC-CRT POST /api/ad/new devuelve Create Response valido @ADS-TC-CRT', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    // El handler create.js lee el body aunque el path sea /api/ad/new (literal).
    // is_enabled es String 'true'/'false' (backend coerce con Boolean()).
    const payload = {
      name: `[QA-CONTRACT] Ad-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      type: 'local',
      is_enabled: 'false',
      schedule: { pre: '', post: '', mid: [] },
    };
    const res = await api.post('/api/ad/new', { data: payload });
    expect(res.status(), `POST /api/ad/new fallo: ${await res.text()}`).toBe(200);
    const body = await res.json();
    const parsed = createAdResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    cleaner.register('ad', parsed.data.data._id);
  });

  test('ADS-TC-GET GET /api/ad/:id devuelve Get Response valido @ADS-TC-GET', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    const create = await api.post('/api/ad/new', {
      data: {
        name: `[QA-CONTRACT] AdGet-${Date.now()}`,
        type: 'local', is_enabled: 'false',
        schedule: { pre: '', post: '', mid: [] },
      },
    });
    expect(create.status()).toBe(200);
    const created = await create.json();
    const id = created?.data?._id;
    expect(id).toBeTruthy();
    cleaner.register('ad', id);

    const res = await api.get(`/api/ad/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = getAdResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(parsed.data.data._id).toBe(id);
  });

  test('ADS-TC-LST GET /api/ad (list) devuelve List Response valido @ADS-TC-LST', async ({ api }) => {
    // El frontend sm2 admin llama con limit=11/status=0 por defecto (cosechado en vivo).
    const res = await api.get('/api/ad', { params: { limit: 5, status: 0 } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = listAdResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(Array.isArray(parsed.data.data)).toBe(true);
  });

  test('ADS-TC-404 GET /api/ad/:fake_id devuelve 404 @ADS-TC-404', async ({ api }) => {
    const res = await api.get('/api/ad/000000000000000000000000');
    expect(res.status(), `GET ad inexistente deberia 404`).toBe(404);
  });
});
