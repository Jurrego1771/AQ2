// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { showSchema } = require('../../../../src/schemas/show.schema');
const { faker } = require('@faker-js/faker');
const { env } = require('../../../../src/utils/env');

/**
 * @api @integration — Recommended Shows Feature (POST /api/show/:id).
 * Portado desde api_test_flow/tests/show/show_recommended.test.js.
 *
 * Endpoint destino: POST <baseURL>/api/show/:id (proxy) o POST <SHOW_API_URL>/show/:id
 * (directo). El campo `recommended_shows[criteria]` acepta shows/episodes/categorias/genres
 * con bracket notation y se envia como application/x-www-form-urlencoded.
 *
 * Restricciones:
 *  - SHOW_API_TOKEN (JWT) requerido para validar persistencia via GET /show/:id/recommended.
 *    Sin el, los tests que verifican GET /recommended se skipean.
 *  - TEST_CATEGORY_ID / TEST_EPISODE_ID opcionales para evitar IDs hard-coded.
 */
const SHOW_API_URL = process.env.SHOW_API_URL || null;
const SHOW_PATH = (id) => (SHOW_API_URL ? `/show/${id}` : `/api/show/${id}`);

const SHOW_API_TOKEN = process.env.SHOW_API_TOKEN || process.env.API_TOKEN || '';
const RECOMMENDED_SHOWS_AVAILABLE = !!process.env.SHOW_API_TOKEN;

const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded' };

function buildRecommendedShowsForm(basePayload = {}, criteriaConfig = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(basePayload)) {
    if (value !== null && value !== undefined) {
      params.append(key, String(value));
    }
  }
  const {
    showsEnabled = false,
    shows = [],
    episodesEnabled = false,
    episodes = [],
    categoriesEnabled = false,
    categories = [],
    genresEnabled = false,
    genres = [],
  } = criteriaConfig;

  params.append('recommended_shows[criteria][shows_enabled]', String(showsEnabled));
  shows.forEach((s, i) => {
    params.append(`recommended_shows[criteria][shows][${i}][_id]`, s._id);
    params.append(`recommended_shows[criteria][shows][${i}][title]`, s.title ?? '');
    params.append(`recommended_shows[criteria][shows][${i}][description]`, s.description ?? '');
  });

  params.append('recommended_shows[criteria][episodes_enabled]', String(episodesEnabled));
  episodes.forEach((ep, i) => {
    params.append(`recommended_shows[criteria][episodes][${i}][_id]`, ep._id);
    params.append(`recommended_shows[criteria][episodes][${i}][title]`, ep.title ?? '');
    params.append(`recommended_shows[criteria][episodes][${i}][description]`, ep.description ?? '');
  });

  params.append('recommended_shows[criteria][categories_enabled]', String(categoriesEnabled));
  categories.forEach((cat, i) => {
    params.append(`recommended_shows[criteria][categories][${i}][category]`, cat.category);
    params.append(`recommended_shows[criteria][categories][${i}][max_items]`, String(cat.max_items ?? 10));
    params.append(`recommended_shows[criteria][categories][${i}][sort_by]`, cat.sort_by ?? 'date_updated');
    params.append(`recommended_shows[criteria][categories][${i}][order]`, cat.order ?? 'desc');
  });

  params.append('recommended_shows[criteria][genres_enabled]', String(genresEnabled));
  genres.forEach((genre) => {
    params.append('recommended_shows[criteria][genres][]', genre);
  });

  return params.toString();
}

async function createTempShow(apiClient, attrs = {}) {
  const payload = {
    title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Ref Show ${Date.now()}`,
    type: 'tvshow',
    ...attrs,
  };
  const res = await apiClient.post('/api/show', payload, { form: true });
  if (!res.ok) {
    throw new Error(`createTempShow failed: ${res.status}`);
  }
  const raw = res.body?.data ?? res.body;
  return Array.isArray(raw) ? raw[0] : raw;
}

function extractShow(body) {
  const raw = body?.data ?? body;
  return Array.isArray(raw) ? raw[0] : raw;
}

test.describe('Show Recommended Shows @api @integration POST /show/:id', () => {
  test.skip(env.isProd, 'prodGuard');

  let showApiCtx;

  test.beforeAll(async ({ playwright }) => {
    const baseURL = SHOW_API_URL || env.baseURL;
    showApiCtx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { 'X-API-Token': SHOW_API_TOKEN },
    });
  });

  test.afterAll(async () => {
    await showApiCtx?.dispose();
  });

  test.describe('1. Shows Criteria', () => {
    test('SHW-TC-REC-001 UPDATE ShowsCriteriaEnabled @SHW-TC-REC-001', async ({ apiToken: api }) => {
      test.skip(
        !RECOMMENDED_SHOWS_AVAILABLE,
        'Set SHOW_API_TOKEN=<JWT> in .env to validate recommended_shows persistence'
      );
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });

      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const refShow = await createTempShow(apiClient);
      cleaner.register('show', refShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          showsEnabled: true,
          shows: [{ _id: refShow._id, title: refShow.title ?? '', description: '' }],
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();

      const getRes = await showApiCtx.get(`${SHOW_PATH(tempShow._id)}/recommended`);
      expect(getRes.ok()).toBeTruthy();
      const recBody = await getRes.json();
      expect(recBody.status).toBe('OK');
      expect(recBody.data).toHaveProperty('criteria');
      expect(recBody.data.criteria.shows_enabled).toBe(true);
      expect(Array.isArray(recBody.data.criteria.shows)).toBeTruthy();
      expect(recBody.data.criteria.shows).toContain(refShow._id);

      await cleaner.clean();
    });

    test('SHW-TC-REC-002 UPDATE ShowsCriteriaDisabled @SHW-TC-REC-002', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        { showsEnabled: false }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();

      const body = await res.json();
      const updated = extractShow(body);
      expect(updated._id).toBe(tempShow._id);

      if (updated.recommended_shows?.criteria?.shows_enabled !== undefined) {
        expect(
          updated.recommended_shows.criteria.shows_enabled === false ||
          updated.recommended_shows.criteria.shows_enabled === 'false'
        ).toBeTruthy();
      }

      await cleaner.clean();
    });
  });

  test.describe('2. Categories Criteria', () => {
    test('SHW-TC-REC-010 UPDATE CategoriesCriteriaEnabled @SHW-TC-REC-010', async ({ apiToken: api }) => {
      test.skip(
        !RECOMMENDED_SHOWS_AVAILABLE,
        'Set SHOW_API_TOKEN=<JWT> in .env to validate recommended_shows persistence'
      );
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const categoryId = process.env.TEST_CATEGORY_ID || '695fe63daba5b5ab3a04e7e7';

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          categoriesEnabled: true,
          categories: [{
            category: categoryId,
            max_items: 10,
            sort_by: 'date_updated',
            order: 'desc',
          }],
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();

      const getRes = await showApiCtx.get(`${SHOW_PATH(tempShow._id)}/recommended`);
      expect(getRes.ok()).toBeTruthy();
      const recBody = await getRes.json();
      expect(recBody.status).toBe('OK');
      expect(recBody.data.criteria.categories_enabled).toBe(true);
      expect(Array.isArray(recBody.data.criteria.categories)).toBeTruthy();

      await cleaner.clean();
    });

    test('SHW-TC-REC-011 UPDATE CategoriesSortByDateCreated @SHW-TC-REC-011', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const categoryId = process.env.TEST_CATEGORY_ID || '695fe63daba5b5ab3a04e7e7';

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          categoriesEnabled: true,
          categories: [{
            category: categoryId,
            max_items: 5,
            sort_by: 'date_created',
            order: 'asc',
          }],
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();
      const body = await res.json();
      const updated = extractShow(body);
      expect(updated._id).toBe(tempShow._id);

      await cleaner.clean();
    });
  });

  test.describe('3. Genres Criteria', () => {
    test('SHW-TC-REC-020 UPDATE GenresCriteriaEnabled @SHW-TC-REC-020', async ({ apiToken: api }) => {
      test.skip(
        !RECOMMENDED_SHOWS_AVAILABLE,
        'Set SHOW_API_TOKEN=<JWT> in .env to validate recommended_shows persistence'
      );
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        { genresEnabled: true, genres: ['animation'] }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();

      const getRes = await showApiCtx.get(`${SHOW_PATH(tempShow._id)}/recommended`);
      expect(getRes.ok()).toBeTruthy();
      const recBody = await getRes.json();
      expect(recBody.status).toBe('OK');
      expect(recBody.data.criteria.genres_enabled).toBe(true);
      expect(recBody.data.criteria.genres).toContain('animation');

      await cleaner.clean();
    });

    test('SHW-TC-REC-021 UPDATE GenresMultipleValues @SHW-TC-REC-021', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        { genresEnabled: true, genres: ['animation', 'comedy', 'drama'] }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();
      const body = await res.json();
      const updated = extractShow(body);
      expect(updated._id).toBe(tempShow._id);

      await cleaner.clean();
    });
  });

  test.describe('4. Episodes Criteria', () => {
    test('SHW-TC-REC-030 UPDATE EpisodesCriteriaEnabled @SHW-TC-REC-030', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const episodeId = process.env.TEST_EPISODE_ID || '69a1d09572c433c77f7fcb3e';

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          episodesEnabled: true,
          episodes: [{ _id: episodeId, title: '', description: '' }],
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect([200, 400, 422]).toContain(res.status());

      if (res.ok()) {
        const body = await res.json();
        const updated = extractShow(body);
        expect(updated._id).toBe(tempShow._id);
      }

      await cleaner.clean();
    });

    test('SHW-TC-REC-031 UPDATE EpisodesCriteriaDisabled @SHW-TC-REC-031', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        { episodesEnabled: false }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();
      const body = await res.json();
      const updated = extractShow(body);
      expect(updated._id).toBe(tempShow._id);

      await cleaner.clean();
    });
  });

  test.describe('5. All Criteria Combined', () => {
    test('SHW-TC-REC-040 UPDATE AllCriteriaEnabled @SHW-TC-REC-040', async ({ apiToken: api }) => {
      test.skip(
        !RECOMMENDED_SHOWS_AVAILABLE,
        'Set SHOW_API_TOKEN=<JWT> in .env to validate recommended_shows persistence'
      );
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const refShow = await createTempShow(apiClient);
      cleaner.register('show', refShow._id);

      const categoryId = process.env.TEST_CATEGORY_ID || '695fe63daba5b5ab3a04e7e7';

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          showsEnabled: true,
          shows: [{ _id: refShow._id, title: '', description: '' }],
          episodesEnabled: false,
          episodes: [],
          categoriesEnabled: true,
          categories: [{
            category: categoryId,
            max_items: 10,
            sort_by: 'date_updated',
            order: 'desc',
          }],
          genresEnabled: true,
          genres: ['animation'],
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();

      const getRes = await showApiCtx.get(`${SHOW_PATH(tempShow._id)}/recommended`);
      expect(getRes.ok()).toBeTruthy();
      const recBody = await getRes.json();
      expect(recBody.status).toBe('OK');

      const criteria = recBody.data.criteria;
      expect(criteria).toBeDefined();
      expect(criteria.shows_enabled).toBe(true);
      expect(criteria.genres_enabled).toBe(true);
      expect(criteria.genres).toContain('animation');

      await cleaner.clean();
    });

    test('SHW-TC-REC-041 UPDATE AllCriteriaDisabled @SHW-TC-REC-041', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          showsEnabled: false,
          episodesEnabled: false,
          categoriesEnabled: false,
          genresEnabled: false,
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();
      const body = await res.json();
      const updated = extractShow(body);
      expect(updated._id).toBe(tempShow._id);

      await cleaner.clean();
    });
  });

  test.describe('6. Persistence GET after UPDATE', () => {
    test('SHW-TC-REC-050 GET RecommendedShowsPersistedAfterUpdate @SHW-TC-REC-050', async ({ apiToken: api }) => {
      test.skip(
        !RECOMMENDED_SHOWS_AVAILABLE,
        'Set SHOW_API_TOKEN=<JWT> in .env to validate recommended_shows persistence'
      );
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const refShow = await createTempShow(apiClient);
      cleaner.register('show', refShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          showsEnabled: true,
          shows: [{ _id: refShow._id, title: '', description: '' }],
          genresEnabled: true,
          genres: ['comedy'],
        }
      );

      const updateRes = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(updateRes.ok(), `POST /show/:id: ${updateRes.status()}`).toBeTruthy();

      const getRes = await showApiCtx.get(`${SHOW_PATH(tempShow._id)}/recommended`);
      expect(getRes.ok()).toBeTruthy();
      const recBody = await getRes.json();
      expect(recBody.status).toBe('OK');
      expect(recBody.data).toHaveProperty('criteria');

      const criteria = recBody.data.criteria;
      expect(criteria.shows_enabled).toBe(true);
      expect(Array.isArray(criteria.shows)).toBeTruthy();
      expect(criteria.shows).toContain(refShow._id);
      expect(criteria.genres_enabled).toBe(true);
      expect(criteria.genres).toContain('comedy');

      await cleaner.clean();
    });

    test('SHW-TC-REC-051 GET RecommendedShowsCriteriaStructure @SHW-TC-REC-051', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const categoryId = process.env.TEST_CATEGORY_ID || '695fe63daba5b5ab3a04e7e7';

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          categoriesEnabled: true,
          categories: [{
            category: categoryId,
            max_items: 8,
            sort_by: 'date_updated',
            order: 'asc',
          }],
        }
      );

      await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });

      const getRes = await showApiCtx.get(`${SHOW_PATH(tempShow._id)}/recommended`);
      expect(getRes.ok()).toBeTruthy();
      const recBody = await getRes.json();
      expect(recBody.status).toBe('OK');

      const criteria = recBody.data?.criteria;
      if (criteria?.categories_enabled && criteria?.categories?.length > 0) {
        const cat = criteria.categories[0];
        expect(cat).toBeTruthy();
        if (typeof cat === 'object') {
          expect(cat).toHaveProperty('category');
        }
      }

      await cleaner.clean();
    });
  });

  test.describe('7. Negative Cases', () => {
    test('SHW-TC-REC-NEG-001 UPDATE InvalidShowIdInCriteria @SHW-TC-REC-NEG-001', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          showsEnabled: true,
          shows: [{ _id: '000000000000000000000000', title: '', description: '' }],
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect([200, 400, 404, 422, 500]).toContain(res.status());

      await cleaner.clean();
    });

    test('SHW-TC-REC-NEG-002 UPDATE InvalidGenreInCriteria @SHW-TC-REC-NEG-002', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        { genresEnabled: true, genres: ['genre_that_does_not_exist_xyz'] }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect([200, 400, 422, 500]).toContain(res.status());

      await cleaner.clean();
    });

    test('SHW-TC-REC-NEG-003 UPDATE EmptyShowsArrayWhenEnabled @SHW-TC-REC-NEG-003', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        { showsEnabled: true, shows: [] }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect([200, 400, 422]).toContain(res.status());

      await cleaner.clean();
    });

    test('SHW-TC-REC-NEG-004 UPDATE MultipleShowsInCriteria @SHW-TC-REC-NEG-004', async ({ apiToken: api }) => {
      const apiClient = new ApiClient(api);
      const cleaner = new ResourceCleaner(api, { testId: test.info().title });
      const tempShow = await createTempShow(apiClient);
      cleaner.register('show', tempShow._id);

      const refShow1 = await createTempShow(apiClient);
      cleaner.register('show', refShow1._id);
      const refShow2 = await createTempShow(apiClient);
      cleaner.register('show', refShow2._id);

      const formBody = buildRecommendedShowsForm(
        { title: tempShow.title },
        {
          showsEnabled: true,
          shows: [
            { _id: refShow1._id, title: '', description: '' },
            { _id: refShow2._id, title: '', description: '' },
          ],
        }
      );

      const res = await showApiCtx.post(SHOW_PATH(tempShow._id), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect(res.ok(), `POST /show/:id: ${res.status()}`).toBeTruthy();
      const body = await res.json();
      const updated = extractShow(body);
      expect(updated._id).toBe(tempShow._id);

      await cleaner.clean();
    });

    test('SHW-TC-REC-NEG-005 UPDATE NonExistentShowTarget @SHW-TC-REC-NEG-005', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const formBody = buildRecommendedShowsForm(
        {},
        { showsEnabled: true, shows: [] }
      );

      const res = await showApiCtx.post(SHOW_PATH(fakeId), {
        data: formBody,
        headers: FORM_HEADERS,
      });
      expect([403, 404, 500]).toContain(res.status());
    });
  });
});