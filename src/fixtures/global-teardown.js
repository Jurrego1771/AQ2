// @ts-check
const path = require('node:path');
const { ResourceSweeper } = require('./resource-sweeper');
const { env } = require('../utils/env');

/**
 * globalTeardown — AQ2.
 *
 * Safety net del run (Capa 4 de la estrategia). Barre los recursos
 * `[QA-AUTO][run=<runId>]` que NO se limpiaron en los teardown per-test
 * (crash, kill, timeout duro, fixture sin register, etc.).
 *
 * Comportamiento:
 *   - Lee QA_RUN_ID (lo pone globalSetup). Sin él, no hay nada que barrer.
 *   - Por defecto barre solo el run actual. Con QA_SWEEP_HISTORICAL=true,
 *     barre cualquier [QA-AUTO][run=<*>] huérfano de runs anteriores.
 *   - **Skip total en prod** (env.isProd). Un teardown global NUNCA debe
 *     correr contra prod aunque se invoque por error.
 *   - Best-effort: un fallo de red/list/delete no aborta; queda en el
 *     reporte `reports/cleanup-<runId>.json`.
 *
 * Idempotente y barato: cero trabajo si no hay nada que barrer.
 *
 * Ver: knowledge-core/cross-cutting/test-provisioning/overview.md
 */
module.exports = async function globalTeardown() {
  // Guard prod: un teardown global NUNCA debe tocar prod aunque un agente lo
  // invoque por error. La convención es per-test skip; este es un segundo
  // cinturón.
  if (env.isProd) {
    // eslint-disable-next-line no-console
    console.log('[AQ2 globalTeardown] skip (env.isProd=true)');
    return;
  }

  const runId = process.env.QA_RUN_ID;
  if (!runId || !/^[0-9a-f]{6}$/.test(runId)) {
    // eslint-disable-next-line no-console
    console.log('[AQ2 globalTeardown] skip (QA_RUN_ID ausente o inválido)');
    return;
  }

  const sweeper = new ResourceSweeper({});
  try {
    await sweeper.init();
    const stats = await sweeper.sweepByRunId(runId);

    // Histórico opcional: si está activado, además barre runs anteriores
    // etiquetados [QA-AUTO] (limpieza profunda del dev compartido).
    if (process.env.QA_SWEEP_HISTORICAL === 'true') {
      const histStats = await sweeper.sweepHistorical();
      stats.historical = histStats;
      stats.totalFound += histStats.totalFound;
      stats.totalDeleted += histStats.totalDeleted;
      stats.totalLeaked += histStats.totalLeaked;
    }

    const reportPath = path.join('reports', `cleanup-${runId}.json`);
    sweeper.writeReport(reportPath, stats);

    // eslint-disable-next-line no-console
    console.log(
      `[AQ2 globalTeardown] runId=${runId} found=${stats.totalFound} ` +
        `deleted=${stats.totalDeleted} leaked=${stats.totalLeaked} ` +
        `-> ${reportPath}`
    );

    // Warning visible si quedaron leaks: NO falla el build (best-effort),
    // pero el run queda marcado en el reporte para revisión.
    if (stats.totalLeaked > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[AQ2 globalTeardown] WARN: ${stats.totalLeaked} recursos no pudieron ` +
          `borrarse. Ver ${reportPath}.`
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[AQ2 globalTeardown] error: ${e?.stack || e}`);
  } finally {
    await sweeper.dispose();
  }
};