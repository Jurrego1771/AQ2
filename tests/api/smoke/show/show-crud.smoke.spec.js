// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { env } = require('../../../../src/utils/env');

/**
 * @api @smoke — CRUD mínimo del recurso Show.
 *
 * Portado desde api_test_flow/tests/api/smoke/show/show-crud.smoke.spec.js.
 *
 * ATENCION: en este build de sm2 SOLO esta expuesto /api/show/list (ver CLAUDE.md).
 * Los endpoints POST /api/show, GET /api/show/:id y DELETE /api/show/:id NO estan
 * registrados publicamente — los casos que los invocan devolveran 404 hasta que
 * sm2 los exponga. La cobertura viva del CRUD vive en:
 *   - tests/smoke/show.smoke.spec.js (UI)
 *   - tests/regression/show-list.regression.spec.js (UI lista)
 */
test.describe('Show API @api @smoke - CRUD', () => {
  test.skip(env.isProd, 'prodGuard');

  const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test-account-id';

  function getShowFromBody(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  async function createShow(client, attrs = {}) {
    const payload = {
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Show ${Date.now()}`,
      type: 'tvshow',
      account: ACCOUNT_ID,
      ...attrs,
    };
    const res = await client.post('/api/show', payload, { form: true });
    if (!res.ok) {
      throw new Error(`createShow failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return getShowFromBody(res.body);
  }

  test('SHW-TC-CRUD-001 POST CreateMinimal @SHW-TC-CRUD-001', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const payload = {
      account: ACCOUNT_ID,
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Show ${Date.now()}`,
      type: 'tvshow',
    };
    const res = await apiClient.post('/api/show', payload, { form: true });
    expect(res.ok, `POST /api/show: ${res.status}`).toBeTruthy();

    const created = getShowFromBody(res.body);
    expect(created).toHaveProperty('_id');
    expect(created.title).toBe(payload.title);
    expect(created.type).toBe('tvshow');

    if (created?._id) cleaner.register('show', created._id);
    await cleaner.clean();
  });

  test('SHW-TC-CRUD-010 GET ExistingShowDetail @SHW-TC-CRUD-010', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const show = await createShow(apiClient, { type: 'tvshow' });
    cleaner.register('show', show._id);

    const res = await apiClient.get(`/api/show/${show._id}`);
    expect(res.ok, `GET /api/show/:id: ${res.status}`).toBeTruthy();

    const fetched = getShowFromBody(res.body);
    expect(fetched._id).toBe(show._id);
    expect(fetched.title).toBe(show.title);

    await cleaner.clean();
  });

  test('SHW-TC-CRUD-NEG-010 GET NonExistentShow @SHW-TC-CRUD-NEG-010', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);

    const res = await apiClient.get('/api/show/507f1f77bcf86cd799439011');
    // BUG conocido: API devuelve 500 "2 UNKNOWN: NOT_FOUND" en lugar de 404.
    expect([404, 500]).toContain(res.status);
  });

  test('SHW-TC-CRUD-050 DELETE Success @SHW-TC-CRUD-050', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);

    const show = await createShow(apiClient, { type: 'radioshow' });

    const res = await apiClient.delete(`/api/show/${show._id}`);
    expect(res.status, `DELETE: ${JSON.stringify(res.body)}`).toBe(200);
  });

  test('SHW-TC-CRUD-NEG-002 POST MissingTitle @SHW-TC-CRUD-NEG-002', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);

    const res = await apiClient.post(
      '/api/show',
      { account: ACCOUNT_ID, type: 'tvshow' },
      { form: true }
    );
    expect([400, 422]).toContain(res.status);
  });
});