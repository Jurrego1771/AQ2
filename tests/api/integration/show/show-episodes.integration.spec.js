// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { episodeSchema } = require('../../../../src/schemas/episode.schema');
const { faker } = require('@faker-js/faker');
const { env } = require('../../../../src/utils/env');

/**
 * @api @integration — Episode sub-recurso de Show: full CRUD.
 * Endpoints:
 *   POST   /api/show/:id/season/:seasonId/episode
 *   GET    /api/show/:id/season/:seasonId/episode
 *   GET    /api/show/:id/season/:seasonId/episode/:episodeId
 *   POST   /api/show/:id/season/:seasonId/episode/:episodeId
 *   DELETE /api/show/:id/season/:seasonId/episode/:episodeId
 *
 * Portado desde api_test_flow/tests/api/integration/show/show-episodes.integration.spec.js.
 *
 * QUIRKS:
 *  - CREATE / GET-by-id / UPDATE: episode en root (sin wrapper {status, data})
 *  - LIST: { version, data: [...] } (sin "status")
 *  - not_found: 500 "2 UNKNOWN: NOT_FOUND" (bug, debería ser 404)
 *  - Validation: 400 con { version, data: "Mising required body fields: ..." } (typo)
 *
 * Restriccion del entorno: cada media solo puede aparecer en UN episode global.
 * El spec prueba 2 medias "libres" en beforeAll (las crea via POST + DELETE).
 */
test.describe('Show Episode @api @integration - Full CRUD', () => {
  test.skip(env.isProd, 'prodGuard');

  let mediaId, mediaId2;

  test.beforeAll(async ({ playwright }) => {
    // El CRUD de /api/show (y /api/media) exige el header X-API-TOKEN de cuenta;
    // la cookie de sesión del login UI da 401. Ver env.apiToken / fixture apiToken.
    const ctx = await playwright.request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { 'X-API-TOKEN': env.apiToken },
    });
    try {
      // Antes se cazaban 2 medias "libres" (no usadas en otro episodio) del
      // listado, pero en cuentas con data real todas las recientes ya están
      // ocupadas -> "found 0". En su lugar CREAMOS 2 medias dedicadas: libres
      // por definición, self-contained, y con el nombre [QA-AUTO][run=<id>] para
      // que el sweeper global las limpie si el afterAll no corre.
      const run = process.env.QA_RUN_ID || 'local';
      const mk = async (n) => {
        const res = await ctx.post('/api/media', {
          form: { title: `[QA-AUTO][run=${run}] ep-media-${n}-${Date.now()}`, type: 'video' },
        });
        if (!res.ok()) {
          throw new Error(`beforeAll: no se pudo crear media: ${res.status()} ${await res.text()}`);
        }
        const body = await res.json();
        return (body?.data ?? body)._id;
      };
      mediaId = await mk(1);
      mediaId2 = await mk(2);
    } finally {
      await ctx.dispose();
    }
  });

  test.afterAll(async ({ playwright }) => {
    // Best-effort: borra las 2 medias dedicadas creadas en beforeAll.
    const ctx = await playwright.request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { 'X-API-TOKEN': env.apiToken },
    });
    try {
      for (const id of [mediaId, mediaId2]) {
        if (id) await ctx.delete(`/api/media/${id}`).catch(() => {});
      }
    } finally {
      await ctx.dispose();
    }
  });

  async function createShowFixture(api) {
    const res = await api.post('/api/show', {
      form: {
        title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ep-${Date.now()}`,
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

  async function createSeason(apiClient, showId, cleaner) {
    const res = await apiClient.post(`/api/show/${showId}/season`, {
      title: `qa_season_${faker.string.alphanumeric(6)}`,
    });
    expect(res.status).toBe(200);
    const season = res.body?.data ?? res.body;
    cleaner.register('season', `${showId}/${season._id}`);
    return season;
  }

  async function createEpisode(
    apiClient,
    showId,
    seasonId,
    cleaner,
    attrs = {}
  ) {
    const payload = {
      title: `qa_episode_${faker.string.alphanumeric(8)}`,
      content: [{ content_type: 'Media', type: 'full', value: mediaId }],
      ...attrs,
    };
    const res = await apiClient.post(
      `/api/show/${showId}/season/${seasonId}/episode`,
      payload
    );
    expect(res.status).toBe(200);
    const episode = res.body?.data ?? res.body;
    cleaner.register('episode', `${showId}/${seasonId}/${episode._id}`);
    return episode;
  }

  // ── CREATE ──────────────────────────────────────────────────────────────────
  test.describe('Create POST /api/show/:id/season/:seasonId/episode', () => {
    let apiClient, cleaner, show;

    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });

    test.afterEach(async () => {
      await cleaner.clean();
    });

    test('SHW-TC-EP-CRT-001 POST episode valid @SHW-TC-EP-CRT-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const title = `qa_episode_${faker.string.alphanumeric(8)}`;

      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode`,
        { title, content: [{ content_type: 'Media', type: 'full', value: mediaId }] }
      );

      expect(res.status).toBe(200);
      expect(res.body._id).toBeTruthy();
      expect(res.body.title).toBe(title);

      cleaner.register('episode', `${show._id}/${season._id}/${res.body._id}`);
      episodeSchema.parse(res.body);
    });

    test('SHW-TC-EP-CRT-002 with optional fields @SHW-TC-EP-CRT-002', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode`,
        {
          title: `qa_episode_opt_${faker.string.alphanumeric(6)}`,
          description: 'qa_episode_description',
          first_emision: '2024-03-01',
          content: [{ content_type: 'Media', type: 'recap', value: mediaId }],
        }
      );
      expect(res.status).toBe(200);
      expect(res.body._id).toBeTruthy();
      expect(res.body.description).toBe('qa_episode_description');

      cleaner.register('episode', `${show._id}/${season._id}/${res.body._id}`);
    });

    test('SHW-TC-EP-CRT-003 order auto assigned @SHW-TC-EP-CRT-003', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const ep1 = await createEpisode(apiClient, show._id, season._id, cleaner, {
        content: [{ content_type: 'Media', type: 'full', value: mediaId }],
      });
      const ep2 = await createEpisode(apiClient, show._id, season._id, cleaner, {
        content: [{ content_type: 'Media', type: 'full', value: mediaId2 }],
      });

      expect(typeof ep1.order).toBe('number');
      expect(typeof ep2.order).toBe('number');
      expect(ep2.order).toBeGreaterThan(ep1.order);
    });

    test('SHW-TC-EP-CRT-VAL-001 missing title @SHW-TC-EP-CRT-VAL-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode`,
        { content: [{ content_type: 'Media', value: mediaId }] }
      );
      expect(res.status).toBe(400);
      expect(res.body.data).toMatch(/title/i);
    });

    test('SHW-TC-EP-CRT-VAL-002 missing content @SHW-TC-EP-CRT-VAL-002', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode`,
        { title: `qa_episode_no_content_${faker.string.alphanumeric(6)}` }
      );
      expect(res.status).toBe(400);
      expect(res.body.data).toMatch(/content/i);
    });

    test('SHW-TC-EP-CRT-NEG-001 season not found @SHW-TC-EP-CRT-NEG-001', async () => {
      const res = await apiClient.post(
        `/api/show/${show._id}/season/000000000000000000000000/episode`,
        {
          title: 'qa_irrelevant',
          content: [{ content_type: 'Media', value: mediaId }],
        }
      );
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-EP-CRT-AUTH-001 no token @SHW-TC-EP-CRT-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const ctx = await playwright.request.newContext({
        baseURL: env.baseURL,
      });
      try {
        const res = await ctx.post(
          `/api/show/${show._id}/season/${season._id}/episode`,
          {
            data: {
              title: 'qa_no_auth',
              content: [{ content_type: 'Media', value: mediaId }],
            },
          }
        );
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });

  // ── LIST ────────────────────────────────────────────────────────────────────
  test.describe('List GET /api/show/:id/season/:seasonId/episode', () => {
    let apiClient, cleaner, show;

    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });

    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-EP-LST-001 valid @SHW-TC-EP-LST-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      await createEpisode(apiClient, show._id, season._id, cleaner);

      const res = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}/episode`
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('SHW-TC-EP-LST-002 empty season @SHW-TC-EP-LST-002', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}/episode`
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('SHW-TC-EP-LST-003 with limit @SHW-TC-EP-LST-003', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      await createEpisode(apiClient, show._id, season._id, cleaner, {
        content: [{ content_type: 'Media', type: 'full', value: mediaId }],
      });
      await createEpisode(apiClient, show._id, season._id, cleaner, {
        content: [{ content_type: 'Media', type: 'full', value: mediaId2 }],
      });
      const res = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}/episode?limit=1`
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });

    test('SHW-TC-EP-LST-AUTH-001 no token @SHW-TC-EP-LST-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.get(
          `/api/show/${show._id}/season/${season._id}/episode`
        );
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });

  // ── GET BY ID ────────────────────────────────────────────────────────────────
  test.describe('Get by ID GET /api/show/:id/season/:seasonId/episode/:episodeId', () => {
    let apiClient, cleaner, show;

    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });

    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-EP-GET-001 valid @SHW-TC-EP-GET-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const episode = await createEpisode(apiClient, show._id, season._id, cleaner);

      const res = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`
      );
      expect(res.status).toBe(200);
      expect(res.body._id).toBe(episode._id);
      expect(res.body.title).toBe(episode.title);
      episodeSchema.parse(res.body);
    });

    test('SHW-TC-EP-GET-NEG-001 not found @SHW-TC-EP-GET-NEG-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}/episode/000000000000000000000000`
      );
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-EP-GET-AUTH-001 no token @SHW-TC-EP-GET-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const episode = await createEpisode(apiClient, show._id, season._id, cleaner);
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.get(
          `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`
        );
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });

  // ── UPDATE ───────────────────────────────────────────────────────────────────
  test.describe('Update POST /api/show/:id/season/:seasonId/episode/:episodeId', () => {
    let apiClient, cleaner, show;

    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });

    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-EP-UPD-001 update title @SHW-TC-EP-UPD-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const episode = await createEpisode(apiClient, show._id, season._id, cleaner);
      const newTitle = `qa_ep_updated_${faker.string.alphanumeric(6)}`;

      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`,
        { title: newTitle }
      );
      expect(res.status).toBe(200);
      expect(res.body.title).toBe(newTitle);
    });

    test('SHW-TC-EP-UPD-002 update description @SHW-TC-EP-UPD-002', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const episode = await createEpisode(apiClient, show._id, season._id, cleaner);

      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`,
        { description: 'qa_updated_description' }
      );
      expect(res.status).toBe(200);
      expect(res.body.description).toBe('qa_updated_description');
    });

    test('SHW-TC-EP-UPD-003 update persists @SHW-TC-EP-UPD-003', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const episode = await createEpisode(apiClient, show._id, season._id, cleaner);
      const newTitle = `qa_ep_persist_${faker.string.alphanumeric(6)}`;

      await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`,
        { title: newTitle }
      );
      const getRes = await apiClient.get(
        `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.title).toBe(newTitle);
    });

    test('SHW-TC-EP-UPD-NEG-001 not found @SHW-TC-EP-UPD-NEG-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode/000000000000000000000000`,
        { title: 'qa_irrelevant' }
      );
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-EP-UPD-AUTH-001 no token @SHW-TC-EP-UPD-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const episode = await createEpisode(apiClient, show._id, season._id, cleaner);
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.post(
          `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`,
          { data: { title: 'qa_no_auth' } }
        );
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });

  // ── DELETE ───────────────────────────────────────────────────────────────────
  test.describe('Delete DELETE /api/show/:id/season/:seasonId/episode/:episodeId', () => {
    let apiClient, cleaner, show;

    test.beforeEach(async ({ apiToken: api }) => {
      apiClient = new ApiClient(api);
      cleaner = new ResourceCleaner(api, { testId: test.info().title });
      show = await createShowFixture(api);
      cleaner.register('show', show._id);
    });

    test.afterEach(async () => { await cleaner.clean(); });

    test('SHW-TC-EP-DEL-001 valid @SHW-TC-EP-DEL-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const createRes = await apiClient.post(
        `/api/show/${show._id}/season/${season._id}/episode`,
        {
          title: `qa_ep_del_${faker.string.alphanumeric(6)}`,
          content: [{ content_type: 'Media', type: 'full', value: mediaId }],
        }
      );
      expect(createRes.status).toBe(200);
      const episode = createRes.body;

      const res = await apiClient.delete(
        `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`
      );
      expect(res.status).toBe(200);
    });

    test('SHW-TC-EP-DEL-NEG-001 not found @SHW-TC-EP-DEL-NEG-001', async () => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const res = await apiClient.delete(
        `/api/show/${show._id}/season/${season._id}/episode/000000000000000000000000`
      );
      expect([404, 500]).toContain(res.status);
    });

    test('SHW-TC-EP-DEL-AUTH-001 no token @SHW-TC-EP-DEL-AUTH-001', async ({ playwright }) => {
      const season = await createSeason(apiClient, show._id, cleaner);
      const episode = await createEpisode(apiClient, show._id, season._id, cleaner);
      const ctx = await playwright.request.newContext({ baseURL: env.baseURL });
      try {
        const res = await ctx.delete(
          `/api/show/${show._id}/season/${season._id}/episode/${episode._id}`
        );
        expect([401, 403]).toContain(res.status());
      } finally { await ctx.dispose(); }
    });
  });
});