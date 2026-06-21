// @ts-check

/**
 * Limpieza de recursos creados por un test. Best-effort e idempotente: un fallo
 * de teardown nunca debe convertir un test verde en rojo. Reintenta para tolerar
 * dependencias (p.ej. borrar hijos antes que padres).
 *
 * Uso:
 *   const cleaner = new ResourceCleaner(api)
 *   cleaner.register('media', id)
 *   ...
 *   await cleaner.clean()   // en el teardown del fixture
 */
const MAX_PASSES = 3
const PASS_DELAY_MS = 500

const DELETERS = {
  media: (api, id) => api.delete(`/api/media/${id}`),
  'live-stream': (api, id) => api.delete(`/api/live-stream/${id}`),
}

class ResourceCleaner {
  /** @param {import('@playwright/test').APIRequestContext} api */
  constructor(api) {
    this.api = api
    /** @type {{type:string,id:string}[]} */
    this.resources = []
  }

  /** @param {string} type @param {string} id */
  register(type, id) {
    if (!id) return
    this.resources.push({ type, id })
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
          // 404 = ya no existe (limpio). 2xx = borrado. Otro = reintentar.
          if (!response.ok() && response.status() !== 404) this.resources.push(res)
        } catch {
          this.resources.push(res)
        }
      }
      if (this.resources.length) await new Promise((r) => setTimeout(r, PASS_DELAY_MS))
    }
  }
}

module.exports = { ResourceCleaner }
