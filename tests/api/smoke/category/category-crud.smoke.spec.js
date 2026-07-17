// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { env } = require('../../../../src/utils/env');
const { qaName } = require('../../../../src/utils/qa-name');

/**
 * @api @smoke — CRUD mínimo del recurso Category.
 *
 * Portado desde api_test_flow/tests/api/smoke/category/category-crud.smoke.spec.js.
 *
 * Verificación en vivo (2026-07-14): el bot QA en dev YA tiene el módulo
 * `category` habilitado para escribir (la nota "verificado 2026-07-08: 403"
 * del categoryFactory quedó desactualizada). Todos los tests de este spec son
 * VERDES — la nota del factory se actualiza junto con este PR.
 *
 * Bloque GET (5): forma del envelope jsonp, filtros `category_name`/`full`/
 * `with_count`, y visibilidad de categorías recién creadas en el listado.
 *
 * Bloque POST (6): creación mínima/completa, validaciones (`name` requerido,
 * `drm` inválido se normaliza, `parent` inválido, `name` vacío). El teardown
 * borra las categorías vía DELETE /api/category/:id (deleter registrado en
 * ResourceCleaner). Si sm2 cambia el shape de la respuesta, los specs rompen
 * rápido en CI.
 *
 * Cobertura paralela (read-only) del recurso: tests/api/contract/category/
 * category.api.contract.spec.js (CAT-TC-001..004). Este spec cubre EXCLUSIVAMENTE
 * el CRUD que NO estaba en AQ2.
 */
test.describe('Category API @api @smoke - CRUD', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  function getCategoryFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

    function categoryName(testInfo, suffix) {
      return qaName({ type: 'Cat', testTitle: testInfo.title, suffix });
    }

    async function createCategory(client, cleaner, testInfo, overrides = {}) {
      const payload = {
        name: categoryName(testInfo, overrides.suffix || 'base'),
        drm: 'deny',
        track: true,
        visible: true,
        ...overrides,
      };
      const res = await client.post('/api/category', payload, { form: true });
      if (res.ok && res.body) {
        const created = getCategoryFromBody(res.body);
        if (created?._id) cleaner.register('category', created._id);
        return created;
      }
      throw new Error(
        `createCategory fallo: status=${res.status} body=${JSON.stringify(res.body).slice(0, 300)}`
      );
    }

  // ---------- GET /api/category — bloque verde ----------

  test('CAT-CRUD-001 GET sin filtros devuelve OK + array @CAT-CRUD-001', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.get('/api/category');

    expect(res.ok, `GET /api/category: status=${res.status}`).toBeTruthy();
    expect(res.body?.status).toBe('OK');
    expect(Array.isArray(res.body?.data)).toBe(true);
  });

  test('CAT-CRUD-002 GET ?category_name filtra por nombre @CAT-CRUD-002', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const target = categoryName(test.info(), 'findme');
    // createCategory puede 403 en dev (bot sin módulo); si falla, saltamos.
    const created = await createCategory(
      apiClient,
      cleaner,
      test.info(),
      { name: target, suffix: 'findme' }
    );
    test.skip(!created, 'CAT-CRUD-SKIP: POST /api/category bloqueado en esta cuenta; saltamos busqueda por nombre recien creado');

    // El índice de búsqueda puede tardar unos segundos: poll.
    await expect
      .poll(
        async () => {
          const r = await apiClient.get(`/api/category?category_name=${encodeURIComponent(target)}`);
          return r.body?.data?.map((c) => c.name) ?? [];
        },
        { timeout: 8000, intervals: [500, 1000, 2000] }
      )
      .toContain(target);

    await cleaner.clean();
  });

  test('CAT-CRUD-003 GET ?full=true devuelve lista con ruta completa @CAT-CRUD-003', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.get('/api/category?full=true');

    expect(res.ok, `GET ?full=true: status=${res.status}`).toBeTruthy();
    expect(res.body?.status).toBe('OK');
    expect(Array.isArray(res.body?.data)).toBe(true);
  });

  test('CAT-CRUD-004 GET ?with_count=true devuelve lista con conteo @CAT-CRUD-004', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.get('/api/category?with_count=true');

    expect(res.ok, `GET ?with_count=true: status=${res.status}`).toBeTruthy();
    expect(res.body?.status).toBe('OK');
    expect(Array.isArray(res.body?.data)).toBe(true);
  });

  test('CAT-CRUD-005 GET incluye la categoria hija recien creada @CAT-CRUD-005', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const parentName = categoryName(test.info(), 'parent');
    const childName = categoryName(test.info(), 'child');

    const parent = await createCategory(
      apiClient,
      cleaner,
      test.info(),
      { name: parentName, suffix: 'parent' }
    );
    expect(parent, 'createCategory(parent) devolvio null').toBeTruthy();

    const child = await createCategory(
      apiClient,
      cleaner,
      test.info(),
      { name: childName, parent: parent._id, suffix: 'child' }
    );
    expect(child, 'createCategory(child) devolvio null').toBeTruthy();

    const res = await apiClient.get(`/api/category?category_name=${encodeURIComponent(childName)}`);
    expect(res.ok, `GET category_name: status=${res.status}`).toBeTruthy();
    const ids = (res.body?.data ?? []).map((c) => c._id);
    expect(ids, `child ${childName} no aparece en el listado`).toContain(child._id);

    await cleaner.clean();
  });

  // ---------- POST /api/category — bloque verde ----------

  test('CAT-CRUD-010 POST minimo (solo name) crea categoria @CAT-CRUD-010', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const res = await apiClient.post(
      '/api/category',
      { name: categoryName(test.info(), 'min') },
      { form: true }
    );

    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('OK');
    expect(res.body?.data?.name).toMatch(/^\[QA-AUTO\]/);

    const created = getCategoryFromBody(res.body);
    if (created?._id) cleaner.register('category', created._id);
    await cleaner.clean();
  });

  test('CAT-CRUD-011 POST completa persiste parent/drm/track/visible @CAT-CRUD-011', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const parent = await createCategory(
      apiClient,
      cleaner,
      test.info(),
      { name: categoryName(test.info(), 'parent-full'), suffix: 'parent-full' }
    );
    expect(parent, 'createCategory(parent) devolvio null').toBeTruthy();

    const name = categoryName(test.info(), 'full');
    const res = await apiClient.post(
      '/api/category',
      {
        name,
        description: 'Categoria creada con todos los campos',
        drm: 'deny',
        parent: parent._id,
        track: true,
        visible: false,
      },
      { form: true }
    );

    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('OK');
    expect(res.body?.data?.name).toBe(name);

    const created = getCategoryFromBody(res.body);
    if (created?._id) cleaner.register('category', created._id);
    await cleaner.clean();
  });

  test('CAT-CRUD-NEG-010 POST sin name devuelve 400 NAME_IS_REQUIRED @CAT-CRUD-NEG-010', async ({ api }) => {
    const apiClient = new ApiClient(api);

    const res = await apiClient.post(
      '/api/category',
      {
        description: 'Sin nombre',
        drm: 'deny',
        track: true,
        visible: true,
      },
      { form: true }
    );

    expect(res.status).toBe(400);
    expect(res.body?.status).toBe('ERROR');
    expect(res.body?.data).toBe('NAME_IS_REQUIRED');
  });

  test('CAT-CRUD-NEG-011 POST con drm invalido normaliza a drm.enabled=false @CAT-CRUD-NEG-011', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const res = await apiClient.post(
      '/api/category',
      {
        name: categoryName(test.info(), 'invalid-drm'),
        drm: 'invalid_value',
        track: true,
        visible: true,
      },
      { form: true }
    );

    // sm2 normaliza silenciosamente: 200 OK con drm.enabled=false.
    expect(res.status).toBe(200);
    expect(res.body?.data?.drm?.enabled).toBe(false);
    expect(res.body?.data?.drm?.allow).toBe(false);

    const created = getCategoryFromBody(res.body);
    if (created?._id) cleaner.register('category', created._id);
    await cleaner.clean();
  });

  test('CAT-CRUD-NEG-012 POST con parent invalido devuelve 4xx/5xx @CAT-CRUD-NEG-012', async ({ api }) => {
    const apiClient = new ApiClient(api);

    const res = await apiClient.post(
      '/api/category',
      {
        name: categoryName(test.info(), 'invalid-parent'),
        parent: 'not_a_valid_id',
        track: true,
        visible: true,
      },
      { form: true }
    );

    expect([400, 500]).toContain(res.status);
    expect(res.body?.status).toBe('ERROR');
  });

  test('CAT-CRUD-NEG-013 POST con name vacio devuelve 4xx/5xx @CAT-CRUD-NEG-013', async ({ api }) => {
    const apiClient = new ApiClient(api);

    const res = await apiClient.post(
      '/api/category',
      {
        name: '',
        description: 'Nombre vacio',
        track: true,
        visible: true,
      },
      { form: true }
    );

    expect([400, 500]).toContain(res.status);
    expect(res.body?.status).toBe('ERROR');
  });
});
