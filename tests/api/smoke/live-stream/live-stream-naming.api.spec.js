// @ts-check
const { test, expect } = require('../../../../src/fixtures');

/**
 * F1 (Provisioning strategy, Capa 0) — verificar que el helper qaName() genera
 * nombres con la convención completa `[QA-AUTO][run=<id>][w=<n>]` y que el
 * server los devuelve tal cual en el listado.
 *
 * Self-contained: crea un live por API y lo borra al terminar (LIVE-TC-25).
 */
test('F1: crear live usa la convención [QA-AUTO][run=<id>][w=<n>] y aparece tal cual en el listado @api @live-stream @LIVE-TC-25', async ({
  liveStream,
  liveStreamClient,
  api,
}) => {
  const res = await liveStreamClient.getById(liveStream);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const name = body?.data?.name || '';

  // Convención: prefijo, runId de 6 hex, workerId numérico, todo entre corchetes.
  expect(name, `nombre inesperado: ${name}`).toMatch(
    /^\[QA-AUTO\]\[run=[0-9a-f]{6}\]\[w=\d+\] /
  );
  expect(name).toContain(`[run=${process.env.QA_RUN_ID}]`);

  // El nombre también debe aparecer en el listado (los filtros por sort/limit
  // no lo esconden si fue recién creado).
  const list = await api.get(
    '/api/live-stream?all=true&limit=20&sort=-date_created&lite=true'
  );
  expect(list.ok()).toBeTruthy();
  const items = (await list.json()).data || [];
  const found = items.find((m) => m?._id === liveStream);
  expect(found, 'el live creado debe aparecer en los últimos 20').toBeTruthy();
  expect(found.name).toBe(name);
});