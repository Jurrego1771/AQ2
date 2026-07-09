// @ts-check
const fs = require('node:fs');
const path = require('node:path');

/**
 * ResourceRegistry — observabilidad del ciclo de vida de los recursos.
 *
 * Singleton por proceso (`globalThis.__aq2Registry__`). El ResourceCleaner
 * lo notifica en `register()` y en cada delete exitoso. Al final del run
 * (process exit hook), cada worker serializa su registry a un archivo
 * `reports/provisioning-w<workerId>-<runId>.json`. El globalTeardown
 * agrega todos los archivos per-worker en `reports/provisioning-<runId>.json`.
 *
 * Por que per-worker: Playwright corre cada worker en un proceso Node
 * separado. El globalTeardown corre en el main process, que NO ve el
 * estado de los workers. Por eso cada worker debe persistir su snapshot.
 *
 * Diferencia con ResourceSweeper (C4):
 *   - Sweeper: barre por nombre `[QA-AUTO][run=<id>]` lo que esta en el
 *     entorno, sin saber si fue nuestro.
 *   - Registry: sabe exactamente QUE fue nuestro. Si al final hay leaks,
 *     el reporte lo distingue: created=N deleted=M leaked=K.
 *
 * Costo: O(1) por operacion. Tolerante a concurrencia dentro del proceso
 * (un solo event loop de Node; las operaciones son sincronas desde el
 * punto de vista de JS).
 */
class ResourceRegistry {
  constructor() {
    /**
     * Recursos actualmente registrados y aun no borrados.
     * Key: `${type}:${id}`. Value incluye meta (testId opcional).
     * @type {Map<string, {type:string,id:string,testId?:string,createdAt:number}>}
     */
    this.created = new Map();

    /**
     * Recursos borrados durante el run (auditoria).
     * @type {Map<string, {type:string,id:string,testId?:string,createdAt:number,deletedAt:number,durationMs:number,status:number}>}
     */
    this.deleted = new Map();
  }

  /**
   * Registra la creacion de un recurso. Idempotente: si el id ya esta
   * registrado, actualiza la entrada (no duplica).
   * @param {string} type
   * @param {string} id
   * @param {object} [meta]
   * @param {string} [meta.testId] Titulo del test que lo creo (para auditoria).
   */
  register(type, id, meta = {}) {
    if (!type || !id) return;
    const key = `${type}:${id}`;
    const existing = this.created.get(key);
    if (existing) {
      // Update meta (testId puede llegar despues via segundo register).
      Object.assign(existing, meta);
      return;
    }
    this.created.set(key, {
      type,
      id,
      testId: meta.testId,
      createdAt: Date.now(),
    });
  }

  /**
   * Marca un recurso como borrado. Lo mueve de `created` a `deleted` con
   * timestamp y duracion. Si el id no estaba registrado (caso raro: creado
   * por un cleaner paralelo), lo agrega directo a `deleted` con createdAt
   * = deletedAt.
   * @param {string} type
   * @param {string} id
   * @param {number} [status] HTTP status del delete (200, 204, 404, etc.).
   */
  markDeleted(type, id, status = 0) {
    if (!type || !id) return;
    const key = `${type}:${id}`;
    const c = this.created.get(key);
    const now = Date.now();
    if (c) {
      this.deleted.set(key, {
        ...c,
        deletedAt: now,
        durationMs: now - c.createdAt,
        status,
      });
      this.created.delete(key);
    } else {
      // No estaba registrado: lo agregamos a deleted igual para auditoria
      // (puede pasar si se borra algo de un cleaner paralelo).
      this.deleted.set(key, {
        type,
        id,
        createdAt: now,
        deletedAt: now,
        durationMs: 0,
        status,
      });
    }
  }

  /**
   * Recurso "leaked" = fue creado pero su cleaner no lo borro.
   * @returns {{type:string,id:string,testId?:string,createdAt:number,ageMs:number}[]}
   */
  leaked() {
    const now = Date.now();
    return [...this.created.values()].map((c) => ({
      type: c.type,
      id: c.id,
      testId: c.testId,
      createdAt: c.createdAt,
      ageMs: now - c.createdAt,
    }));
  }

  /**
   * Stats agregadas. Se serializa en globalTeardown a
   * `reports/provisioning-<runId>.json`.
   *
   * Por tipo: `created` = total que fueron registrados (vivos o borrados),
   * `deleted` = cuantos se borraron, `leaked` = cuantos siguen vivos.
   * @param {string} runId
   */
  stats(runId) {
    const byType = {};
    // Borrados: fueron creados y ademas fueron borrados.
    for (const d of this.deleted.values()) {
      byType[d.type] = byType[d.type] || { created: 0, deleted: 0, leaked: 0 };
      byType[d.type].created += 1;
      byType[d.type].deleted += 1;
    }
    // Vivos (created y aun no borrados): leaked.
    for (const c of this.created.values()) {
      byType[c.type] = byType[c.type] || { created: 0, deleted: 0, leaked: 0 };
      byType[c.type].created += 1;
      byType[c.type].leaked += 1;
    }
    const deleted = [...this.deleted.values()];
    const durations = deleted.map((d) => d.durationMs).filter((n) => n > 0);
    return {
      runId,
      workerId: process.env.TEST_PARALLEL_INDEX || '0',
      totals: {
        created: this.created.size + this.deleted.size,
        deleted: this.deleted.size,
        leaked: this.created.size,
        byType,
      },
      duration_ms: durations.length
        ? {
            count: durations.length,
            p50: percentile(durations, 0.5),
            p95: percentile(durations, 0.95),
            max: Math.max(...durations),
          }
        : null,
      deleted: deleted, // muestra completa
      leaked: this.leaked(),
    };
  }
}

/**
 * Percentil sobre un array de numeros (ordenado in-place).
 * @param {number[]} arr
 * @param {number} p 0..1
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

/** Singleton del proceso (resiste a HMR / require.cache). */
function get() {
  if (!globalThis.__aq2Registry__) {
    globalThis.__aq2Registry__ = new ResourceRegistry();
  }
  // Instala el exit hook en la primera llamada (cubre cualquier path que
  // use el registry, no solo ResourceCleaner).
  _installExitHook();
  return globalThis.__aq2Registry__;
}

/** Reset para tests. No usar en runtime. */
function _resetForTests() {
  globalThis.__aq2Registry__ = new ResourceRegistry();
}

// ─── Per-worker persistence (process exit hook) ────────────────────────────
// Cada worker persiste su registry a un archivo cuando el proceso termina.
// El globalTeardown agrega todos los per-worker en el provisioning final.

let _exitHookInstalled = false;
function _installExitHook() {
  if (_exitHookInstalled) return;
  _exitHookInstalled = true;

  // 'beforeExit' y 'exit' pueden NO dispararse en workers de Playwright
  // (el test runner puede mantener el proceso vivo hasta que termina el run).
  // La persistencia per-worker se hace desde `flush()` (llamado por
  // ResourceCleaner al final de cada clean()), garantizando que siempre
  // haya un snapshot reciente en disco.
  process.on('beforeExit', () => {
    flush();
  });
}

/**
 * Escribe el snapshot per-worker a disco. Llamado por el ResourceCleaner al
 * final de cada clean() y por el exit hook como red de seguridad.
 *
 * Idempotente: el archivo es el mismo path siempre; gana la ultima escritura.
 */
function flush() {
  const runId = process.env.QA_RUN_ID;
  if (!runId || !/^[0-9a-f]{6}$/.test(runId)) return;
  const workerId = process.env.TEST_PARALLEL_INDEX || '0';
  const registry = get();
  // No persistir si el registry esta vacio (ahorra ruido en runs sin writes).
  if (registry.created.size === 0 && registry.deleted.size === 0) return;
  try {
    const file = path.join('reports', `provisioning-w${workerId}-${runId}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(registry.stats(runId), null, 2));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[AQ2 resource-registry] fallo persistir worker snapshot: ${e.message}`);
  }
}

module.exports = { ResourceRegistry, get, _resetForTests, _installExitHook, flush };