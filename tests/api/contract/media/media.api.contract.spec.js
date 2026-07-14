// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { mediaItem } = require('../../../../src/fixtures/data.factory');
const {
  createMediaResponseSchema,
  getMediaResponseSchema,
  listMediaResponseSchema,
  countMediaResponseSchema,
} = require('../../../../src/schemas/media.schema');

/**
 * @api — Contrato HTTP del recurso Media (sm2 vista medias.coffee).
 * Valida que las respuestas cumplen la forma Zod esperada (`src/schemas/media.schema`).
 * Si sm2 cambia un campo (rename, type, removal) el spec rompe - senal rapida en CI.
 *
 * Adaptado de api_test_flow/tests/api/contract/media/media.contract.spec.js (rama
 * previa del repo). Diferencias con el original:
 *  - Auth = cookies de admin via storageState (reusado del fixture `apiClient`).
 *    El old repo usaba header X-API-Token; AQ2 mantiene el modelo cookies.
 *  - Respuestas 200 mantienen envelope jsonp `{status:'OK', data: ...}`.
 *  - Cleanup self-contained via ResourceCleaner (no try/cfinally).
 *  - Titulos unicos `[QA-CONTRACT] Media-{ts}-{rand}` para multiples corridas.
 *
 * Pre-requisito: el usuario debe estar logueado (storageState valido).
 * prodGuard: este spec escribe en dev/qa; se skipea en prod.
 */
test.describe('Media API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  test('MED-TC-025 POST /api/media devuelve Create Response valido @MED-TC-025', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    // Creamos con factory y limitamos la explosion de campos enviando solo lo minimo.
    // El server rellena defaults (status, is_published, slug, etc.).
    const payload = mediaItem({ title: `[QA-CONTRACT] Media-${Date.now()}-${Math.floor(Math.random() * 1e6)}` });

    const res = await api.post('/api/media', { data: payload });
    expect(res.status(), `POST /api/media fallo: ${await res.text()}`).toBe(200);

    const body = await res.json();
    const parsed = createMediaResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);

    // El id persistido va al cleaner para borrarse al final del test.
    const id = parsed.data.data?._id || body?.data?._id;
    expect(id, 'la respuesta debe incluir data._id').toBeTruthy();
    cleaner.register('media', id);
  });

  test('MED-TC-026 GET /api/media/:id devuelve Get Response valido @MED-TC-026', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    // Setup: crear un media para tener un id conocido.
    const createRes = await api.post('/api/media', {
      data: mediaItem({ title: `[QA-CONTRACT] Get-${Date.now()}` }),
    });
    expect(createRes.status(), `POST /api/media preparo test fallo`).toBe(200);
    const created = await createRes.json();
    const id = created?.data?._id;
    expect(id, 'POST no devolvio id').toBeTruthy();
    cleaner.register('media', id);

    // Ahora el GET que valida el contrato.
    const res = await api.get(`/api/media/${id}`);
    expect(res.status(), `GET /api/media/:id fallo`).toBe(200);

    const body = await res.json();
    const parsed = getMediaResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);

    // El _id del GET debe matchear el creado (consistencia create -> get).
    expect(parsed.data.data._id).toBe(id);
  });

  test('MED-TC-027 GET /api/media (list) devuelve List Response valido @MED-TC-027', async ({ api }) => {
    // Smoke de contrato del listado. No dependemos de la cantidad de resultados
    // (puede haber 0 en una cuenta fresca) - validamos solo la forma.
    const res = await api.get('/api/media', { params: { limit: 5 } });
    expect(res.status(), `GET /api/media fallo`).toBe(200);

    const body = await res.json();
    const parsed = listMediaResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);

    // Shape: status:'OK' y data = array (puede estar vacio).
    expect(Array.isArray(parsed.data.data)).toBe(true);
  });

  test('MED-TC-028 GET /api/media?count=true devuelve Number Response valido @MED-TC-028', async ({ api }) => {
    // El handler sm2 devuelve `data: <number>` cuando viene ?count=true.
    // Esto valida que NO estemos asumiendo siempre un array.
    const res = await api.get('/api/media', { params: { count: true, limit: 5 } });
    expect(res.status(), `GET ?count=true fallo`).toBe(200);

    const body = await res.json();
    const parsed = countMediaResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);

    expect(typeof parsed.data.data).toBe('number');
    expect(parsed.data.data).toBeGreaterThanOrEqual(0);
  });
});
