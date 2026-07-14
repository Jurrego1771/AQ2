// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { seasonSchema } = require('../../../../src/schemas/season.schema');
const { faker } = require('@faker-js/faker');
const { env } = require('../../../../src/utils/env');

/**
 * @api @smoke — POST /api/show/:id/season (creación de season).
 *
 * Portado desde api_test_flow/tests/api/smoke/show/show-seasons.smoke.spec.js.
 * Cubre el happy path + auth + validación + casos de error del sub-recurso Season.
 *
 * La API sm2 devuelve el season en root (no envuelto en {status, data}). El helper
 * `getSeasonFromBody` aísla esa peculiaridad para que los asserts sean legibles.
 */
test.describe('Show Season API @api @smoke - Create POST /api/show/:id/season', () => {
  test.skip(env.isProd, 'prodGuard');

  function getSeasonFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  test.describe('Happy Path', () => {
    let apiClient, cleaner, show;

    test.beforeAll(async ({ apiToken: api }) => {
      const createShow = await api.post('/api/show', {
        form: {
          title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] smoke-${Date.now()}`,
          type: 'tvshow',
        },
      });
      if (!createShow.ok()) {
        throw new Error(
          `beforeAll: failed to create show: ${createShow.status()} ${await createShow.text()}`
        );
      }
      const body = await createShow.json();
      const raw = body?.data ?? body;
      show = Array.isArray(raw) ? raw[0] : raw;
      if (!show?._id) {
        throw new Error(`beforeAll: show sin _id: ${JSON.stringify(body)}`);
      }
    });

    test.afterAll(async ({ apiToken: api }) => {
      if (show?._id) {
        await api.delete(`/api/show/${show._id}`);
      }
    });

    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, {
        testId: test.info().title,
      });
    });

    test.afterEach(async () => {
      await cleaner.clean();
    });

    test('SHW-TC-SS-001 POST season valid @SHW-TC-SS-001', async () => {
      const payload = {
        title: `qa_season_${faker.string.alphanumeric(8)}`,
      };
      const res = await apiClient.post(`/api/show/${show._id}/season`, payload);

      expect(res.status, `POST season: ${JSON.stringify(res.body)}`).toBe(200);

      const season = getSeasonFromBody(res.body);
      expect(season._id).toBeTruthy();
      expect(season.title).toBe(payload.title);
      expect(season.show).toBe(show._id);

      cleaner.register('season', `${show._id}/${season._id}`);
      seasonSchema.parse(season);
    });

    test('SHW-TC-SS-002 POST season with optional fields @SHW-TC-SS-002', async () => {
      const payload = {
        title: `qa_season_opt_${faker.string.alphanumeric(6)}`,
        description: 'qa_season_description',
        first_emision: '2024-01-15',
      };
      const res = await apiClient.post(`/api/show/${show._id}/season`, payload);

      expect(res.status, `POST season: ${JSON.stringify(res.body)}`).toBe(200);

      const season = getSeasonFromBody(res.body);
      expect(season._id).toBeTruthy();
      expect(season.description).toBe(payload.description);

      cleaner.register('season', `${show._id}/${season._id}`);
    });

    test('SHW-TC-SS-003 POST season order auto-assigned @SHW-TC-SS-003', async () => {
      const res1 = await apiClient.post(`/api/show/${show._id}/season`, {
        title: `qa_season_ord1_${faker.string.alphanumeric(6)}`,
      });
      expect(res1.status).toBe(200);
      const season1 = getSeasonFromBody(res1.body);
      cleaner.register('season', `${show._id}/${season1._id}`);

      const res2 = await apiClient.post(`/api/show/${show._id}/season`, {
        title: `qa_season_ord2_${faker.string.alphanumeric(6)}`,
      });
      expect(res2.status).toBe(200);
      const season2 = getSeasonFromBody(res2.body);
      cleaner.register('season', `${show._id}/${season2._id}`);

      expect(typeof season1.order).toBe('number');
      expect(typeof season2.order).toBe('number');
      expect(season2.order).toBeGreaterThan(season1.order);
    });

    test('SHW-TC-SS-004 POST season show linked in response @SHW-TC-SS-004', async () => {
      const payload = {
        title: `qa_season_link_${faker.string.alphanumeric(6)}`,
      };
      const res = await apiClient.post(`/api/show/${show._id}/season`, payload);

      expect(res.status).toBe(200);

      const season = getSeasonFromBody(res.body);
      expect(season.show).toBe(show._id);

      cleaner.register('season', `${show._id}/${season._id}`);
    });
  });

  test.describe('Authentication', () => {
    let showId;
    test.beforeAll(async ({ apiToken: api }) => {
      const createShow = await api.post('/api/show', {
        form: {
          title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] auth-${Date.now()}`,
          type: 'tvshow',
        },
      });
      const body = await createShow.json();
      const raw = body?.data ?? body;
      showId = Array.isArray(raw) ? raw[0]._id : raw._id;
    });

    test.afterAll(async ({ apiToken: api }) => {
      if (showId) await api.delete(`/api/show/${showId}`);
    });

    test('SHW-TC-SS-AUTH-001 POST season no token @SHW-TC-SS-AUTH-001', async ({
      playwright,
    }) => {
      // Contexto SIN storageState -> sin sesion -> 401/403 esperados.
      const ctx = await playwright.request.newContext({
        baseURL: env.baseURL,
      });
      try {
        const res = await ctx.post(`/api/show/${showId}/season`, {
          data: {
            title: `qa_season_no_token_${faker.string.alphanumeric(6)}`,
          },
        });
        expect([401, 403]).toContain(res.status());
      } finally {
        await ctx.dispose();
      }
    });

    test('SHW-TC-SS-AUTH-002 POST season invalid token @SHW-TC-SS-AUTH-002', async ({
      playwright,
    }) => {
      const ctx = await playwright.request.newContext({
        baseURL: env.baseURL,
        extraHTTPHeaders: { 'X-API-Token': 'invalid_token_xyz' },
      });
      try {
        const res = await ctx.post(`/api/show/${showId}/season`, {
          data: {
            title: `qa_season_bad_token_${faker.string.alphanumeric(6)}`,
          },
        });
        // BUG conocido: API puede devolver 500 en lugar de 401 con token invalido.
        expect([401, 403, 500]).toContain(res.status());
      } finally {
        await ctx.dispose();
      }
    });
  });

  test.describe('Validation', () => {
    let showId;
    test.beforeAll(async ({ apiToken: api }) => {
      const createShow = await api.post('/api/show', {
        form: {
          title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] val-${Date.now()}`,
          type: 'tvshow',
        },
      });
      const body = await createShow.json();
      const raw = body?.data ?? body;
      showId = Array.isArray(raw) ? raw[0]._id : raw._id;
    });

    test.afterAll(async ({ apiToken: api }) => {
      if (showId) await api.delete(`/api/show/${showId}`);
    });

    test('SHW-TC-SS-VAL-001 POST season missing title @SHW-TC-SS-VAL-001', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const res = await apiClient.post(`/api/show/${showId}/season`, {});
      expect([400, 422, 500]).toContain(res.status);
    });

    test('SHW-TC-SS-VAL-002 POST season empty title @SHW-TC-SS-VAL-002', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const res = await apiClient.post(`/api/show/${showId}/season`, { title: '' });
      expect([400, 422, 500]).toContain(res.status);
    });
  });

  test.describe('Error Cases', () => {
    test('SHW-TC-SS-ERR-001 POST season show not found @SHW-TC-SS-ERR-001', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const fakeShowId = '000000000000000000000000';
      const res = await apiClient.post(`/api/show/${fakeShowId}/season`, {
        title: `qa_season_notfound_${faker.string.alphanumeric(6)}`,
      });
      // BUG: API devuelve 500 en lugar de 404 para show inexistente.
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-SS-ERR-002 POST season invalid show id @SHW-TC-SS-ERR-002', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const res = await apiClient.post('/api/show/not-a-valid-id/season', {
        title: `qa_season_invalid_${faker.string.alphanumeric(6)}`,
      });
      expect([400, 404, 500]).toContain(res.status);
    });
  });
});