// @ts-check

/**
 * Semáforo async por nombre + registry global del proceso.
 *
 * Caso de uso: el dev compartido de Mediastream NO aguanta N POSTs en
 * paralelo desde la suite de AQ2 (workers paralelos martillan el upstream
 * del nginx -> 502 Bad Gateway intermitente). Limitar la concurrencia
 * por tipo (live-stream, media, ad, ...) elimina el stampede sin tocar el
 * server.
 *
 * Por proceso. Con W workers, el máximo efectivo es W × permits por tipo
 * (cada worker tiene su propio semáforo). En CI típico (4 workers × 4
 * permits = 16) sigue siendo razonable para el dev compartido.
 *
 * Activación (todas opt-in):
 *   - Por env:     QA_MAX_CONCURRENT_CREATE=4   (default 0 = desactivado)
 *   - Programatic: get('live-stream', 4).withPermit(() => factory(...))
 *
 * El parámetro `permits=0` desactiva el semáforo (factory corre inline,
 * comportamiento legacy). Cualquier valor > 0 activa la cola.
 *
 * Backpressure:
 *   - Las llamadas se encolan en FIFO.
 *   - Si una falla, el error se propaga al caller; la cola sigue.
 *   - Sin timeout en cola (esperamos lo que sea; la API ya tiene su
 *     timeout propio de 30s).
 *
 * Métricas:
 *   - `inflight()` para diagnóstico (cuántas operaciones en vuelo AHORA).
 *   - `queueDepth()` para detectar acumulación.
 */
class Semaphore {
  /**
   * @param {number} permits Cuántas operaciones concurrentes (0 = desactivado).
   */
  constructor(permits) {
    this.permits = Math.max(0, permits | 0);
    /** @type {{fn:Function,resolve:Function,reject:Function}[]} */
    this.queue = [];
    // Estado interno (prefijado para no chocar con métodos públicos del
    // prototipo — `this.inflight = N` shadowearía `inflight()`).
    this._inflight = 0;
  }

  /** @returns {number} Operaciones en vuelo ahora. */
  inflight() {
    return this._inflight;
  }

  /** @returns {number} Operaciones esperando turno. */
  queueDepth() {
    return this.queue.length;
  }

  /**
   * Ejecuta `fn()` cuando haya un permit disponible. Si el semáforo está
   * desactivado (permits=0), corre inline.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withPermit(fn) {
    if (this.permits === 0) return fn();
    if (this._inflight < this.permits) {
      return this._run(fn);
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
    });
  }

  async _run(fn) {
    this._inflight += 1;
    try {
      return await fn();
    } finally {
      this._inflight -= 1;
      this._drain();
    }
  }

  _drain() {
    while (this.queue.length > 0 && this._inflight < this.permits) {
      const next = this.queue.shift();
      // No await: deja que el caller del withPermit original reciba su
      // resultado via la Promise que ya le pasamos.
      this._run(next.fn).then(next.resolve, next.reject);
    }
  }
}

/** @type {Map<string, Semaphore>} */
const REGISTRY = new Map();

/**
 * Devuelve (y crea lazy) el semáforo para un nombre dado.
 * @param {string} name
 * @param {number} [permits] Si no se pasa, lee QA_MAX_CONCURRENT_CREATE.
 * @returns {Semaphore}
 */
function get(name, permits) {
  if (!REGISTRY.has(name)) {
    const envPermits = process.env.QA_MAX_CONCURRENT_CREATE;
    const n = permits != null
      ? permits
      : envPermits && Number.isFinite(Number.parseInt(envPermits, 10))
        ? Number.parseInt(envPermits, 10)
        : 0;
    REGISTRY.set(name, new Semaphore(n));
  }
  return REGISTRY.get(name);
}

/** Resetea el registry (util en tests). */
function _resetForTests() {
  REGISTRY.clear();
}

module.exports = { Semaphore, get, _resetForTests };