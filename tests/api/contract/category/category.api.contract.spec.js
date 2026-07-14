// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { categoryFactory } = require('../../../../src/fixtures/data.factory');
const {
  listCategoryResponseSchema,
  getCategoryResponseSchema,
  categorySchema,
} = require('../../../../src/schemas/category.schema');

/**
 * @api — Contrato HTTP del recurso Category (sm2 vista categories.coffee).
 * Cubre GET list / detail.
 *
 * Si sm2 cambia el shape del envelope `{status:'OK', data:[...]}` o de los items,
 * los specs rompen rapido en CI.
 */
test.describe('Category API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  test('CAT-TC-001 GET /api/category devuelve List Response valido contra Zod @CAT-TC-001', async ({ api }) => {
    const res = await api.get('/api/category');
    expect(res.status(), `GET /api/category fallo: ${await res.text()}`).toBe(200);

    const body = await res.json();
    const parsed = listCategoryResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}\nbody sample: ${JSON.stringify(body).slice(0, 500)}`
    ).toBe(true);
    // Shape validation: cada item tiene al menos _id.
    if (parsed.data.data.length > 0) {
      expect(parsed.data.data[0]._id).toBeTruthy();
    }
  });

  test('CAT-TC-002 GET /api/category sin auth devuelve 403 INVALID_TOKEN @CAT-TC-002', async () => {
    // No usamos el fixture api (que trae cookies). Hacemos fetch crudo para
    // simular un cliente de terceros (AragonTV sin token profile valido).
    const res = await fetch(`${env.baseURL}/api/category`);
    // fetch nativo devuelve .status como PROPIEDAD, no .status() como el
    // fixture api de Playwright.
    expect(res.status, `Sin auth esperamos 403`).toBe(403);
    const body = await res.json();
    // sm2 responde envelope {status:'ERROR', data:'INVALID_TOKEN'}. Aceptamos
    // cualquier data:string para no atar al literal exato (sm2 podria ajustar
    // el codigo de error en cualquier momento).
    expect(body.status).toBe('ERROR');
    expect(typeof body.data).toBe('string');
  });

  test('CAT-TC-003 GET /api/category/:id devuelve Get Response valido contra Zod @CAT-TC-003', async ({ api }) => {
    // Setup: precisamos un id existente. Tomamos la primera categoria del
    // listado. Si no hay ninguna en dev (cuenta fresca), skip explicito.
    const listRes = await api.get('/api/category');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const firstId = list?.data?.[0]?._id;
    test.skip(!firstId, 'CAT-SKIP: la cuenta no tiene categorias; saltamos detail');

    const res = await api.get(`/api/category/${firstId}`);
    expect(res.status(), `GET /api/category/:id fallo: ${await res.text()}`).toBe(200);
    const body = await res.json();
    const parsed = getCategoryResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(parsed.data.data._id).toBe(firstId);
  });

  test('CAT-TC-004 GET /api/category/:fake_id devuelve 404 NOT_FOUND @CAT-TC-004', async ({ api }) => {
    const res = await api.get('/api/category/000000000000000000000000');
    expect(res.status(), `GET category inexistente deberia 404`).toBe(404);
  });
});
