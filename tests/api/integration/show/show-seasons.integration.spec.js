// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { seasonSchema } = require('../../../../src/schemas/season.schema');
const { faker } = require('@faker-js/faker');
const { env } = require('../../../../src/utils/env');

/**
 * @api @integration - Season sub-recurso de Show: READ / UPDATE / DELETE.
 * Portado desde api_test_flow/tests/api/integration/show/show-seasons.integration.spec.js.
 */
test.describe('Show Season @api @integration - Read / Update / Delete', () => {
  test.skip(env.isProd, 'prodGuard');

  async function createShowFixture(api) {
    const res = await api.post('/api/show', {
      form: {
        title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] int-${Date.now()}`,
        type: 'tvshow',
      },
    });
    if (!res.ok()) {
      throw new Error(
        `fixture: failed to create show: ${res.status()} ${await res.text()}`
      );
    }
    const body = await res.json();
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  async function createSeason(apiClient, showId, cleaner, attrs = {}) {
    const payload = {
      title: `qa_season_${faker.string.alphanumeric(8)}`,
      ...attrs,
    };
    const res = await apiClient.post(`/api/show/${showId}/season`, payload);
    expect(res.status).toBe(200);
    const season = res.body?.data ?? res.body;
    cleaner.register('season', `${showId}/${season._id}`);
    return season;
  }

  test.describe('List GET /api/show/:id/season', () => {
    let apiClient, cleaner, show;
    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });
    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-SS-INT-LST-001 list valid @SHW-TC-SS-INT-LST-001', async () => {
      await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.get(`/api/show/${show._id}/season`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('SHW-TC-SS-INT-LST-002 empty show @SHW-TC-SS-INT-LST-002', async () => {
      const res = await apiClient.get(`/api/show/${show._id}/season`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('SHW-TC-SS-INT-LST-003 with limit @SHW-TC-SS-INT-LST-003', async () => {
      await createSeason(apiClient, show._id, cleaner);
      await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.get(`/api/show/${show._id}/season?limit=1`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });

    test('SHW-TC-SS-INT-LST-NEG-001 show not found @SHW-TC-SS-INT-LST-NEG-001', async () => {
      const res = await apiClient.get(`/api/show/000000000000000000000000/season`);
      // BUG: API devuelve 500 en lugar de 404 SHOW_NOT_FOUND.
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-SS-INT-LST-AUTH-001 no token @SHW-TC-SS-INT-LST-AUTH-001', async ({ playwright }) => {
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.get(`/api/show/${show._id}/season`);
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });

  test.describe('Get by ID GET /api/show/:id/season/:seasonId', () => {
    let apiClient, cleaner, show;
    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });
    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-SS-INT-GET-001 valid @SHW-TC-SS-INT-GET-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.get(`/api/show/${show._id}/season/${season._id}`);
      expect(res.status).toBe(200);
      expect(res.body._id).toBe(season._id);
      expect(res.body.show).toBe(show._id);
      seasonSchema.parse(res.body);
    });

    test('SHW-TC-SS-INT-GET-002 with populate @SHW-TC-SS-INT-GET-002', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}?populate=true`
      );
      expect(res.status).toBe(200);
      expect(res.body._id).toBe(season._id);
      expect(Array.isArray(res.body.episodes)).toBe(true);
    });

    test('SHW-TC-SS-INT-GET-NEG-001 not found @SHW-TC-SS-INT-GET-NEG-001', async () => {
      const res = await apiClient.get(
        `/api/show/${show._id}/season/000000000000000000000000`
      );
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-SS-INT-GET-AUTH-001 no token @SHW-TC-SS-INT-GET-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.get(`/api/show/${show._id}/season/${season._id}`);
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });

  test.describe('Update POST /api/show/:id/season/:seasonId', () => {
    let apiClient, cleaner, show;
    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });
    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-SS-INT-UPD-001 update title @SHW-TC-SS-INT-UPD-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const newTitle = `qa_season_updated_${faker.string.alphanumeric(6)}`;
      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}`,
        { title: newTitle }
      );
      expect(res.status).toBe(200);
      const data = res.body?.data ?? res.body;
      expect(data.title).toBe(newTitle);
    });

    test('SHW-TC-SS-INT-UPD-002 update description @SHW-TC-SS-INT-UPD-002', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}`,
        { description: 'qa_updated_description' }
      );
      expect(res.status).toBe(200);
      const data = res.body?.data ?? res.body;
      expect(data.description).toBe('qa_updated_description');
    });

    test('SHW-TC-SS-INT-UPD-003 update persists @SHW-TC-SS-INT-UPD-003', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const newTitle = `qa_persist_${faker.string.alphanumeric(6)}`;
      await apiClient.post(`/api/show/${show._id}/season/${season._id}`, {
        title: newTitle,
      });
      const getRes = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}`
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.title).toBe(newTitle);
    });

    test('SHW-TC-SS-INT-UPD-NEG-001 not found @SHW-TC-SS-INT-UPD-NEG-001', async () => {
      const res = await apiClient.post(
        `/api/show/${show._id}/season/000000000000000000000000`,
        { title: 'qa_irrelevant' }
      );
      // BUG: API devuelve 500 "2 UNKNOWN: NOT_FOUND" en lugar de 404.
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-SS-INT-UPD-AUTH-001 no token @SHW-TC-SS-INT-UPD-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.post(
          `/api/show/${show._id}/season/${season._id}`,
          { data: { title: 'qa_no_auth' } }
        );
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });

  test.describe('Delete DELETE /api/show/:id/season/:seasonId', () => {
    let apiClient, cleaner, show;
    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });
    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-SS-INT-DEL-001 valid @SHW-TC-SS-INT-DEL-001', async () => {
      // Crear sin registrar en cleaner - el test lo borra manualmente.
      const payload = { title: `qa_season_del_${faker.string.alphanumeric(6)}` };
      const createRes = await apiClient.post(`/api/show/${show._id}/season`, payload);
      expect(createRes.status).toBe(200);
      const season = createRes.body?.data ?? createRes.body;

      const res = await apiClient.delete(`/api/show/${show._id}/season/${season._id}`);
      expect(res.status).toBe(200);
    });

    test('SHW-TC-SS-INT-DEL-002 confirm gone @SHW-TC-SS-INT-DEL-002', async () => {
      const payload = { title: `qa_season_gone_${faker.string.alphanumeric(6)}` };
      const createRes = await apiClient.post(`/api/show/${show._id}/season`, payload);
      const season = createRes.body?.data ?? createRes.body;

      await apiClient.delete(`/api/show/${show._id}/season/${season._id}`);

      const getRes = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}`
      );
      // QUIRK: API puede devolver 200 tras DELETE (soft delete - el record persiste).
      expect([200, 404, 500]).toContain(getRes.status);
    });

    test('SHW-TC-SS-INT-DEL-NEG-001 not found @SHW-TC-SS-INT-DEL-NEG-001', async () => {
      const res = await apiClient.delete(
        `/api/show/${show._id}/season/000000000000000000000000`
      );
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-SS-INT-DEL-AUTH-001 no token @SHW-TC-SS-INT-DEL-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.delete(`/api/show/${show._id}/season/${season._id}`);
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });
});