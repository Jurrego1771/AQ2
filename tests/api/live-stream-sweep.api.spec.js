// @ts-check
const { test, expect } = require('../../src/fixtures');
const { ResourceSweeper } = require('../../src/fixtures/resource-sweeper');

/**
 * F4 — verificación del safety net (sweep global por nombre).
 *
 * Simula un escenario donde un worker crashea y deja un recurso sin limpiar:
 *   1. Crea un live SIN pasarlo por la fixture `liveStream` (sin teardown).
 *   2. Verifica que el ResourceSweeper lo encuentra por nombre y lo borra.
 *   3. Verifica que el live ya no existe (404).
 *
 * Self-contained: el sweeper mismo borra el recurso creado por este test
 * (su nombre matchea `[run=<runId>]`), así que NO necesitamos registrarlo.
 */
test('F4: ResourceSweeper barre [QA-AUTO][run=<id>] huérfano (simula crash) @api @live-stream @LIVE-TC-26', async ({
  api,
}) => {
  const runId = process.env.QA_RUN_ID;
  expect(runId).toMatch(/^[0-9a-f]{6}$/);

  // 1) Crear un live DIRECTO (sin fixture, sin register -> simula crash).
  const title = `[QA-AUTO][run=${runId}][w=0] Live crash-sim ${Date.now()}`;
  const create = await api.post('/api/live-stream/', { data: { name: title, type: 'video' } });
  expect(create.ok(), `create falló: ${create.status()}`).toBeTruthy();
  const { data: live } = await create.json();
  const id = live._id;
  expect(live.name).toBe(title);

  // 2) El sweeper lo debe encontrar y borrar.
  const sweeper = new ResourceSweeper({});
  try {
    await sweeper.init();
    const stats = await sweeper.sweepByRunId(runId);
    expect(stats.totalFound, `debe encontrar >=1 live de este run`).toBeGreaterThanOrEqual(1);
    const lsStats = stats.perType.find((t) => t.type === 'live-stream');
    expect(lsStats.found, 'el live creado sin register debe aparecer').toBeGreaterThanOrEqual(1);
    expect(lsStats.deleted, 'el sweep debe borrarlo').toBeGreaterThanOrEqual(1);
  } finally {
    await sweeper.dispose();
  }

  // 3) Confirmar que ya no existe.
  const after = await api.get(`/api/live-stream/${id}`);
  expect(after.status(), 'después del sweep el live debe ser 404').toBe(404);
});