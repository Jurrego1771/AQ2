// @ts-check
const crypto = require('node:crypto');

/**
 * Helper único para nombres de recursos creados por tests.
 *
 * Convención (ver knowledge-core/cross-cutting/test-provisioning/overview.md,
 * Capa 0):
 *
 *   [QA-AUTO][run=<6-hex>][w=<n>] <Type> <slug> [<ts>]
 *
 * - `[QA-AUTO]`     prefijo compartido (sin cambios). Habilita el sweep global
 *                   por convención.
 * - `[run=<6-hex>]` random por corrida (mismo para todos los workers de un run).
 *                   Lo setea `globalSetup` (src/fixtures/global-setup.js) en
 *                   `process.env.QA_RUN_ID`. Fallback defensivo: random nuevo
 *                   por llamada (útil en scripts one-shot).
 * - `[w=<n>]`       workerId dentro del run (`TEST_PARALLEL_INDEX`).
 * - `<Type>`        Live / Media / Ad / Schedule / etc. (corto, sin espacios).
 * - `<slug>`        kebab-case del título del test, max 60 chars, ascii safe.
 * - `[<ts>]`        ISO timestamp corto (HH:MM:SS) solo si hace falta correlación
 *                   fina; si no, se omite para mantener el nombre legible.
 *
 * Uso:
 *   const name = qaName({ type: 'Live', testTitle: testInfo.title });
 *   const id = await createLiveStream(api, { name });
 *
 * El nombre es estable (mismo runId en todos los workers) y trazable (sweep
 * por `[QA-AUTO][run=<runId>]`).
 */

const SAFE_RE = /[^a-zA-Z0-9]+/g;

/**
 * @param {string} s
 * @returns {string} kebab-case, sin acentos, sin chars no-ASCII.
 */
function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // diacríticos
    .replace(SAFE_RE, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

/** 6 hex chars de crypto. */
function newRunId() {
  return crypto.randomBytes(3).toString('hex');
}

/**
 * Devuelve el runId del proceso (env var). Si no está set (p.ej. desde un
 * script), genera uno nuevo. Garantiza que siempre hay un valor.
 */
function currentRunId() {
  let id = process.env.QA_RUN_ID;
  if (!id || !/^[0-9a-f]{6}$/.test(id)) {
    id = newRunId();
    process.env.QA_RUN_ID = id;
  }
  return id;
}

/** workerId dentro del run. Playwright setea TEST_PARALLEL_INDEX por worker. */
function currentWorkerId() {
  const raw = process.env.TEST_PARALLEL_INDEX;
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * @param {object} parts
 * @param {string} parts.type        Tipo corto del recurso (Live, Media, Ad, ...).
 * @param {string} [parts.testTitle] Título del test (se slugifica).
 * @param {string} [parts.suffix]    Sufijo libre (e.g., 'overlap', 'base').
 * @param {string} [parts.runId]     Override del runId (default: env o nuevo).
 * @param {number} [parts.workerId]  Override del workerId.
 * @param {boolean} [parts.withTs]   Si true, agrega HH:MM:SS (default: false).
 * @returns {string}
 */
function qaName({ type, testTitle = '', suffix = '', runId, workerId, withTs = false } = {}) {
  if (!type) throw new Error('qaName: `type` es obligatorio');
  const r = runId || currentRunId();
  const w = workerId == null ? currentWorkerId() : workerId;
  const head = `[QA-AUTO][run=${r}][w=${w}]`;
  const tail = [type, slug(testTitle), slug(suffix)].filter(Boolean).join(' ');
  const ts = withTs ? ` ${new Date().toISOString().slice(11, 19)}` : '';
  return `${head} ${tail}${ts}`;
}

module.exports = { qaName, slug, currentRunId, currentWorkerId, newRunId };