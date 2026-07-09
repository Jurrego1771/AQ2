// @ts-check
const path = require('node:path');
const fs = require('node:fs');
const { ResourceSweeper } = require('./resource-sweeper');
const { env } = require('../utils/env');

/**
 * globalTeardown — AQ2.
 *
 * Safety net del run (Capa 4) + observabilidad (Capa 2 / Capa 8):
 *   1. Barre [QA-AUTO][run=<runId>] no limpiados per-test (sweep by name).
 *   2. Agrega los snapshots per-worker del ResourceRegistry a
 *      provisioning-<runId>.json (ciclo de vida exacto por worker).
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
 * Reportes generados:
 *   - reports/cleanup-<runId>.json             -> output del sweep (C4)
 *   - reports/provisioning-<runId>.json         -> provisioning agregado (C2)
 *   - reports/provisioning-w<id>-<runId>.json   -> snapshot per-worker (debug)
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

    // Provisioning report (C2): agregar snapshots per-worker.
    const provPath = aggregateProvisioningReport(runId);

    if (provPath) {
      // eslint-disable-next-line no-console
      console.log(`[AQ2 globalTeardown] provisioning -> ${provPath}`);
    }

    // Warning visible si quedaron leaks: NO falla el build (best-effort),
    // pero el run queda marcado en el reporte para revisión.
    if (stats.totalLeaked > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[AQ2 globalTeardown] WARN: ${stats.totalLeaked} recursos no pudieron ` +
          `borrarse (sweep). Ver ${reportPath}.`
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[AQ2 globalTeardown] error: ${e?.stack || e}`);
  } finally {
    await sweeper.dispose();
  }
};

/**
 * Lee todos los snapshots per-worker (`provisioning-w<id>-<runId>.json`) y
 * produce el provisioning agregado del run. Devuelve la ruta del reporte
 * final, o null si no hay nada que agregar.
 */
function aggregateProvisioningReport(runId) {
  const reportsDir = path.resolve('reports');
  if (!fs.existsSync(reportsDir)) return null;

  // Patron: provisioning-w0-abc123.json, provisioning-w1-abc123.json, ...
  const pattern = new RegExp(`^provisioning-w(\\d+)-${runId}\\.json$`);
  const workerFiles = fs
    .readdirSync(reportsDir)
    .filter((f) => pattern.test(f))
    .map((f) => ({
      workerId: pattern.exec(f)[1],
      file: path.join(reportsDir, f),
    }));

  if (workerFiles.length === 0) return null;

  /** @type {Record<string, {created:number,deleted:number,leaked:number}>} */
  const byType = {};
  let totalCreated = 0;
  let totalDeleted = 0;
  let totalLeaked = 0;
  const allDeleted = [];
  const allLeaked = [];
  const perWorker = [];
  const allDurations = [];

  for (const { workerId, file } of workerFiles) {
    const w = JSON.parse(fs.readFileSync(file, 'utf8'));
    perWorker.push({
      workerId,
      created: w.totals.created,
      deleted: w.totals.deleted,
      leaked: w.totals.leaked,
    });
    totalCreated += w.totals.created;
    totalDeleted += w.totals.deleted;
    totalLeaked += w.totals.leaked;
    for (const [type, agg] of Object.entries(w.totals.byType)) {
      byType[type] = byType[type] || { created: 0, deleted: 0, leaked: 0 };
      byType[type].created += agg.created;
      byType[type].deleted += agg.deleted;
      byType[type].leaked += agg.leaked;
    }
    allDeleted.push(...(w.deleted || []));
    allLeaked.push(...(w.leaked || []));
    if (w.duration_ms?.p50) allDurations.push(w.duration_ms.p50);
  }

  // Percentiles agregados (a partir de los p50 por-worker, no es exacto
  // pero da una sensacion global).
  const durationMs = allDurations.length
    ? {
        perWorker: perWorker.length,
        p50: percentile(allDurations, 0.5),
        max: Math.max(...allDurations),
      }
    : null;

  const aggregated = {
    runId,
    workers: perWorker.length,
    totals: {
      created: totalCreated,
      deleted: totalDeleted,
      leaked: totalLeaked,
      byType,
    },
    duration_ms: durationMs,
    per_worker: perWorker,
    deleted: allDeleted,
    leaked: allLeaked,
  };

  const out = path.join('reports', `provisioning-${runId}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(aggregated, null, 2));
  return out;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}