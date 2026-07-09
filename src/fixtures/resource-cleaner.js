// @ts-check
const { get: getRegistry, flush } = require('./resource-registry');

/**
 * Limpieza de recursos creados por un test. Best-effort e idempotente: un fallo
 * de teardown nunca debe convertir un test verde en rojo. Reintenta para tolerar
 * dependencias (p.ej. borrar hijos antes que padres).
 *
 * Ademas notifica al ResourceRegistry del proceso (C2 de la estrategia):
 *   - register()  -> registry.register()
 *   - delete OK   -> registry.markDeleted()
 *   - delete 404  -> registry.markDeleted() (ya no existe = OK)
 *   - delete fail -> queda en el registry como "leaked" hasta el globalTeardown
 *
 * Uso:
 *   const cleaner = new ResourceCleaner(api, { testId: testInfo.title })
 *   cleaner.register('media', id)
 *   ...
 *   await cleaner.clean()   // en el teardown del fixture
 */
const MAX_PASSES = 3
const PASS_DELAY_MS = 500

const DELETERS = {
  media: (api, id) => api.delete(`/api/media/${id}`),
  'live-stream': (api, id) => api.delete(`/api/live-stream/${id}`),
  playlist: (api, id) => api.delete(`/api/playlist/${id}`),
  ad: (api, id) => api.delete(`/api/ad/${id}`),
  // Quiz: id compuesto "liveId/quizId" porque el quiz es sub-recurso del
  // live y su delete endpoint es /api/live-stream/:liveId/quizzes/:quizId.
  // (El ResourceCleaner hace split('/') para obtener ambos.)
  quiz: (api, compositeId) => {
    const [liveId, quizId] = String(compositeId).split('/');
    if (!liveId || !quizId) return { status: () => 0, ok: () => false };
    return api.delete(`/api/live-stream/${liveId}/quizzes/${quizId}`);
  },
}

class ResourceCleaner {
  /**
   * @param {import('@playwright/test').APIRequestContext} api
   * @param {object} [opts]
   * @param {string} [opts.testId] Titulo del test, se envia al registry para
   *   auditoria. Si no se pasa, el registry no tendra testId en sus entries.
   */
  constructor(api, { testId } = {}) {
    this.api = api
    this.testId = testId
    /** @type {{type:string,id:string}[]} */
    this.resources = []
    this.registry = getRegistry()
  }

  /** @param {string} type @param {string} id */
  register(type, id) {
    if (!id) return
    this.resources.push({ type, id })
    this.registry.register(type, id, { testId: this.testId })
  }

  async clean() {
    for (let pass = 0; pass < MAX_PASSES && this.resources.length; pass += 1) {
      const pending = this.resources
      this.resources = []
      for (const res of pending) {
        const deleter = DELETERS[res.type]
        if (!deleter) continue
        try {
          const response = await deleter(this.api, res.id)
          const status = response.status()
          // 2xx = borrado. 404 = ya no existe (limpio). Otro = reintentar.
          if (response.ok() || status === 404) {
            this.registry.markDeleted(res.type, res.id, status)
          } else {
            this.resources.push(res)
          }
        } catch {
          this.resources.push(res)
        }
      }
      if (this.resources.length) await new Promise((r) => setTimeout(r, PASS_DELAY_MS))
    }
    // Los que quedaron en this.resources despues de los pases son "leaked"
    // (el registry ya los tiene como created; no los movemos a deleted).

    // Persistir snapshot per-worker del registry. Llamado sync al final
    // del clean() para que el globalTeardown tenga data actualizada.
    // El archivo se sobreescribe en cada test; el estado final es el
    // de la ultima escritura.
    flush();
  }
}

module.exports = { ResourceCleaner }
