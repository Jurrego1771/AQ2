// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { showSchema } = require('../../../../src/schemas/show.schema');
const { env } = require('../../../../src/utils/env');

/**
 * @api — Contrato HTTP del recurso Show (POST + GET-by-id).
 *
 * Portado desde api_test_flow/tests/api/contract/show/show.contract.spec.js.
 *
 * ATENCION: en este build de sm2 SOLO esta expuesto /api/show/list (ver CLAUDE.md).
 * POST /api/show y GET /api/show/:id NO estan registrados publicamente — los tests
 * de abajo documentan el shape esperado para cuando se expongan. Si ejecutan
 * contra dev y dev.no expone el endpoint, los tests fallaran con 404/500.
 *
 * Los specs del UI (tests/smoke/show + tests/regression/show-*) cubren el flujo
 * de creacion via el formulario sm2; este contrato es el "cuando se exponga".
 */
test.describe('Show API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard');

  test('TC_CON_SHW_001 POST /api/show response schema @SHW-TC-CON-001', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const payload = {
      title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Contract Show ${Date.now()}`,
      type: 'tvshow',
    };
    const res = await apiClient.post('/api/show/', payload, { form: true });

    expect(
      res.ok,
      `Create failed: ${res.status} ${JSON.stringify(res.body)}`
    ).toBeTruthy();

    const show = Array.isArray(res.body?.data)
      ? res.body.data[0]
      : res.body?.data ?? res.body;
    const parsed = showSchema.safeParse(show);
    expect(
      parsed.success,
      `Schema mismatch: ${JSON.stringify(parsed.error?.issues)}`
    ).toBe(true);

    if (show?._id) cleaner.register('show', show._id);
    await cleaner.clean();
  });

  test('TC_CON_SHW_002 GET /api/show/:id response schema @SHW-TC-CON-002', async ({ apiToken: api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const createRes = await apiClient.post(
      '/api/show/',
      {
        title: `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] Contract GET ${Date.now()}`,
        type: 'podcast',
      },
      { form: true }
    );
    expect(createRes.ok, `Create failed: ${createRes.status}`).toBeTruthy();
    const show = Array.isArray(createRes.body?.data)
      ? createRes.body.data[0]
      : createRes.body?.data ?? createRes.body;
    if (show?._id) cleaner.register('show', show._id);

    const res = await apiClient.get(`/api/show/${show._id}`);
    expect(res.ok, `GET failed: ${res.status}`).toBeTruthy();

    const fetched = Array.isArray(res.body?.data)
      ? res.body.data[0]
      : res.body?.data ?? res.body;
    const parsed = showSchema.safeParse(fetched);
    expect(
      parsed.success,
      `Schema mismatch: ${JSON.stringify(parsed.error?.issues)}`
    ).toBe(true);

    await cleaner.clean();
  });
});