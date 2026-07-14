// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { showSchema } = require('../../../../src/schemas/show.schema');
const { showPayload } = require('../../../../src/fixtures/data.factory');
const { faker } = require('@faker-js/faker');
const { env } = require('../../../../src/utils/env');

/**
 * @api @regression — CRUD avanzado del recurso Show + edge cases de validacion.
 * Portado desde api_test_flow/tests/api/regression/show/show-advanced.regression.spec.js.
 *
 * ATENCION: en este build de sm2 SOLO esta expuesto /api/show/list (ver CLAUDE.md).
 * POST /api/show, GET /api/show/:id, POST /api/show/:id (update), DELETE /api/show/:id
 * NO estan registrados publicamente. Todos los casos que invocan esos endpoints
 * fallaran con 404/500 hasta que sm2 los exponga. La cobertura viva esta en los
 * specs UI: tests/smoke/show.smoke.spec.js + tests/regression/show-list.regression.spec.js.
 */
test.describe('1. Create POST /api/show @negative', () => {
  test.skip(env.isProd, 'prodGuard');
  const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test-account-id';

  function getShowFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  test('SHW-TC-REG-001 INSERT MinimalPayload schema validation @SHW-TC-REG-001', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const payload = showPayload({
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Show ${Date.now()}`,
      type: 'tvshow',
      genres: [],
    });
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();

    const created = getShowFromBody(res.body);
    const parsed = showSchema.parse(created);
    expect(parsed._id).toBeTruthy();

    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });

  test('SHW-TC-REG-002 INSERT FullPayload @SHW-TC-REG-002', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const payload = {
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Full Show ${Date.now()}`,
      description: 'Descripcion QA',
      type: 'radioshow',
      genres: [],
    };
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();

    const created = getShowFromBody(res.body);
    expect(created.type).toBe('radioshow');
    expect(created.description).toBe('Descripcion QA');

    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });

  test('SHW-TC-REG-003 INSERT GenresNullCleaning @SHW-TC-REG-003', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const payload = showPayload({
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Null Genres ${Date.now()}`,
      type: 'radioshow',
      genres: [],
    });
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();
    const created = getShowFromBody(res.body);
    expect(Array.isArray(created.genres)).toBeTruthy();
    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });

  test('SHW-TC-REG-004 INSERT NextEpisodeDefault @SHW-TC-REG-004', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const payload = showPayload({
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] NextEp ${Date.now()}`,
      type: 'radioshow',
      genres: [],
    });
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();
    const created = getShowFromBody(res.body);
    expect(created).toHaveProperty('next_episode');
    expect(typeof created.next_episode).toBe('number');
    expect(created.next_episode).toBeGreaterThanOrEqual(0);
    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });

  test('SHW-TC-REG-NEG-001 INSERT MissingAccount @SHW-TC-REG-NEG-001', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const res = await apiClient.post('/api/show', {
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] No Account ${Date.now()}`,
      type: 'tvshow',
    }, { form: true });
    expect([200, 400, 422]).toContain(res.status);
    if (res.ok && res.body?.data?._id) {
      cleaner.register('show', getShowFromBody(res.body)._id);
      await cleaner.clean();
    }
  });

  test('SHW-TC-REG-NEG-003 INSERT InvalidType @SHW-TC-REG-NEG-003', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const res = await apiClient.post('/api/show', {
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] InvalidType ${Date.now()}`,
      type: 'invalid_type_xyz',
    }, { form: true });
    expect([200, 400, 422, 500]).toContain(res.status);
    if (res.ok && res.body?.data?._id) {
      cleaner.register('show', getShowFromBody(res.body)._id);
      await cleaner.clean();
    }
  });

  test('SHW-TC-REG-NEG-004 INSERT InvalidDateFormat @SHW-TC-REG-NEG-004', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const res = await apiClient.post('/api/show', {
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] BadDate ${Date.now()}`,
      type: 'tvshow',
      first_emision: 'not-a-date',
    }, { form: true });
    expect([200, 400, 422]).toContain(res.status);
    if (res.ok && res.body?.data?._id) {
      cleaner.register('show', getShowFromBody(res.body)._id);
      await cleaner.clean();
    }
  });
});

test.describe('2. Read GET /api/show/:id', () => {
  test.skip(env.isProd, 'prodGuard');
  const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test-account-id';

  function getShowFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  async function createShow(client, attrs = {}) {
    const payload = {
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${faker.string.alphanumeric(6)}`,
      type: 'tvshow',
      account: ACCOUNT_ID,
      ...attrs,
    };
    const res = await client.post('/api/show', payload, { form: true });
    if (!res.ok) throw new Error(`createShow failed: ${res.status} ${JSON.stringify(res.body)}`);
    return getShowFromBody(res.body);
  }

  test('SHW-TC-REG-011 GET ShowWithPopulate @SHW-TC-REG-011', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const show = await createShow(apiClient, { type: 'tvshow', is_published: 'true' });
    cleaner.register('show', show._id);

    const res = await apiClient.get(`/api/show/${show._id}?populate=1`);
    expect(res.ok, `GET /api/show/:id: ${res.status}`).toBeTruthy();
    const fetched = getShowFromBody(res.body);
    expect(fetched._id).toBe(show._id);
    expect(fetched).toHaveProperty('distributors');
    expect(fetched).toHaveProperty('producers');

    await cleaner.clean();
  });

  test('SHW-TC-REG-NEG-011 GET InvalidShowId @SHW-TC-REG-NEG-011', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.get('/api/show/not-a-valid-id');
    expect([400, 404, 500]).toContain(res.status);
  });
});

test.describe('3. Update POST /api/show/:id', () => {
  test.skip(env.isProd, 'prodGuard');
  const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test-account-id';

  function getShowFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  async function createShow(client, attrs = {}) {
    const payload = {
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${faker.string.alphanumeric(6)}`,
      type: 'tvshow',
      account: ACCOUNT_ID,
      ...attrs,
    };
    const res = await client.post('/api/show', payload, { form: true });
    if (!res.ok) throw new Error(`createShow failed: ${res.status} ${JSON.stringify(res.body)}`);
    return getShowFromBody(res.body);
  }

  test('SHW-TC-REG-040 UPDATE PartialUpdate @SHW-TC-REG-040', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const show = await createShow(apiClient, { type: 'tvshow', is_published: 'true' });
    cleaner.register('show', show._id);
    const newDescription = faker.lorem.paragraph();

    const res = await apiClient.post(
      `/api/show/${show._id}`,
      { description: newDescription },
      { form: true }
    );
    expect(res.ok, `POST /api/show/:id: ${res.status}`).toBeTruthy();
    const updated = getShowFromBody(res.body);
    expect(updated.description).toBe(newDescription);
    expect(updated._id).toBe(show._id);
    await cleaner.clean();
  });

  test('SHW-TC-REG-041 UPDATE CompleteUpdate @SHW-TC-REG-041', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const show = await createShow(apiClient, { type: 'tvshow', is_published: 'true' });
    cleaner.register('show', show._id);
    const newTitle = `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Updated ${Date.now()}`;
    const newDescription = faker.lorem.paragraph();

    const res = await apiClient.post(
      `/api/show/${show._id}`,
      { title: newTitle, description: newDescription },
      { form: true }
    );
    expect(res.ok, `POST /api/show/:id: ${res.status}`).toBeTruthy();
    const updated = getShowFromBody(res.body);
    expect(updated.title).toBe(newTitle);
    expect(updated.description).toBe(newDescription);
    await cleaner.clean();
  });

  test('SHW-TC-REG-042 UPDATE NextEpisodeValidation @SHW-TC-REG-042', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const show = await createShow(apiClient, { type: 'tvshow', is_published: 'true' });
    cleaner.register('show', show._id);

    const res = await apiClient.post(
      `/api/show/${show._id}`,
      { next_episode: 120 },
      { form: true }
    );
    expect(res.ok, `POST /api/show/:id: ${res.status}`).toBeTruthy();
    const updated = getShowFromBody(res.body);
    expect(typeof updated.next_episode).toBe('number');
    await cleaner.clean();
  });

  test('SHW-TC-REG-NEG-040 UPDATE CannotChangeShowType @SHW-TC-REG-NEG-040', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const show = await createShow(apiClient, { type: 'tvshow', is_published: 'true' });
    cleaner.register('show', show._id);

    if (show.type === 'tvshow') {
      const res = await apiClient.post(
        `/api/show/${show._id}`,
        { type: 'podcast' },
        { form: true }
      );
      expect([200, 400, 422]).toContain(res.status);
    }
    await cleaner.clean();
  });

  test('SHW-TC-REG-NEG-041 UPDATE NonExistentShow @SHW-TC-REG-NEG-041', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.post(
      '/api/show/507f1f77bcf86cd799439011',
      { title: 'Updated' },
      { form: true }
    );
    expect([404, 403, 500]).toContain(res.status);
  });
});

test.describe('4. Remove DELETE /api/show/:id', () => {
  test.skip(env.isProd, 'prodGuard');
  const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test-account-id';

  function getShowFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  async function createShow(client, attrs = {}) {
    const payload = {
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${faker.string.alphanumeric(6)}`,
      type: 'radioshow',
      account: ACCOUNT_ID,
      ...attrs,
    };
    const res = await client.post('/api/show', payload, { form: true });
    if (!res.ok) throw new Error(`createShow failed: ${res.status} ${JSON.stringify(res.body)}`);
    return getShowFromBody(res.body);
  }

  test('SHW-TC-REG-051 REMOVE ShowStatusDeletedAfterRemove @SHW-TC-REG-051', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const show = await createShow(apiClient, { type: 'radioshow' });
    await apiClient.delete(`/api/show/${show._id}`);

    const getRes = await apiClient.get(`/api/show/${show._id}`);
    expect([404, 500, 200]).toContain(getRes.status);
    if (getRes.ok) {
      const fetched = getShowFromBody(getRes.body);
      const status = fetched?.status ?? getRes.body?.status;
      if (status !== undefined) expect(status).toBe('DELETE');
    }
  });

  test('SHW-TC-REG-NEG-050 REMOVE NonExistentShow @SHW-TC-REG-NEG-050', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.delete('/api/show/507f1f77bcf86cd799439011');
    expect([404, 500]).toContain(res.status);
  });

  test('SHW-TC-REG-NEG-051 REMOVE InvalidShowId @SHW-TC-REG-NEG-051', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.delete('/api/show/not-a-valid-id');
    expect([400, 404, 500]).toContain(res.status);
  });
});

test.describe('5. Edge Cases y Validaciones @negative', () => {
  test.skip(env.isProd, 'prodGuard');
  const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test-account-id';

  function getShowFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  test('SHW-TC-REG-070 VALIDATION EmptyTitle @SHW-TC-REG-070', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const res = await apiClient.post('/api/show', {
      account: ACCOUNT_ID,
      title: '',
      type: 'tvshow',
    }, { form: true });
    expect([400, 422]).toContain(res.status);
  });

  test('SHW-TC-REG-071 VALIDATION VeryLongTitle @SHW-TC-REG-071', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const res = await apiClient.post('/api/show', {
      account: ACCOUNT_ID,
      title: 'A'.repeat(5000),
      type: 'tvshow',
    }, { form: true });
    expect([200, 400, 422]).toContain(res.status);
    if (res.ok && res.body?.data?._id) {
      cleaner.register('show', getShowFromBody(res.body)._id);
      await cleaner.clean();
    }
  });

  test('SHW-TC-REG-072 VALIDATION SpecialCharactersInTitle @SHW-TC-REG-072', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const payload = {
      account: ACCOUNT_ID,
      title: `[QA-AUTO] Show @#$%^&*() ${Date.now()}`,
      type: 'tvshow',
    };
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();
    const created = getShowFromBody(res.body);
    expect(created.title).toContain('@#$%^&*()');
    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });

  test('SHW-TC-REG-073 VALIDATION EmptyGenresArray @SHW-TC-REG-073', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const payload = {
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Empty Genres ${Date.now()}`,
      type: 'tvshow',
      genres: [],
    };
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();
    const created = getShowFromBody(res.body);
    expect(Array.isArray(created.genres)).toBeTruthy();
    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });

  test('SHW-TC-REG-074 VALIDATION UnicodeCharactersInDescription @SHW-TC-REG-074', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const payload = {
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Unicode ${Date.now()}`,
      description: 'Hola 中文 بالعربي Emojis: x-y-z',
      type: 'tvshow',
    };
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();
    const created = getShowFromBody(res.body);
    expect(created.description).toContain('Emojis');
    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });
});