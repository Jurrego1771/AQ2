// @ts-check
const { get: getRegistry, flush } = require('./resource-registry');

/**
 * Limpieza de recursos creados por un test. Best-effort e idempotente: un fallo
 * de teardown nunca debe convertir un test verde en rojo. Reintenta agresivamente
 * para tolerar la inestabilidad del dev compartido (502 Bad Gateway, timeouts
 * puntuales, 429, etc.) — un leak por un delete que fallo una vez NO es
 * aceptable: el registry y el globalTeardown los cazan, pero cuesta.
 *
 * Ademas notifica al ResourceRegistry del proceso (C2 de la estrategia):
 *   - register()  -> registry.register()
 *   - delete OK   -> registry.markDeleted()
 *   - delete 404  -> registry.markDeleted() (ya no existe = OK)
 *   - delete fail -> queda en el registry como "leaked" hasta el globalTeardown
 *
 * Politica de retry: 5 intentos con backoff exponencial (1s, 2s, 4s, 8s, 16s).
 * Total max budget ~31s por recurso. Solo reintentamos errores 5xx y 429
 * (transient); 4xx (input invalido) NO se reintenta — el server dijo que no
 * y reintentar no va a cambiar la respuesta.
 *
 * Uso:
 *   const cleaner = new ResourceCleaner(api, { testId: testInfo.title })
 *   cleaner.register('media', id)
 *   ...
 *   await cleaner.clean()   // en el teardown del fixture
 */
const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 1000

const DELETERS = {
  media: (api, id) => api.delete(`/api/media/${id}`),
  'live-stream': (api, id) => api.delete(`/api/live-stream/${id}`),
  playlist: (api, id) => api.delete(`/api/playlist/${id}`),
  ad: (api, id) => api.delete(`/api/ad/${id}`),
  // Category: sm2 expone DELETE /api/category/:id, PERO rechaza borrar un
  // parent con children presentes (400 CANT_DELETE_PARENT, verificado 2026-07-15
  // en vivo contra dev). Para que el teardown sea robusto sin obligar a
  // cada test a registrar los children antes que los parents, hacemos deleter
  // recursivo: GET /api/category?parent=:id -> borra cada child -> borra el
  // parent. Tolerante a 404 (categoria ya borrada = OK). Retorna la Response
  // del ultimo DELETE (que es lo que el outer _deleteWithRetry espera:
  // .status() / .ok() como funciones sobre la Response de Playwright).
  // Si el GET falla por 5xx transient, dejamos que el retry del outer lo
  // propague. Si el primer DELETE falla (parent con children), reintentamos
  // tras borrar children. Si nada funciona, devolvemos la ultima Response
  // con status>=400 para que el outer lo marque como leaked.
  category: async (api, id) => {
    let lastResponse = null;

    const deleteTree = async (cid) => {
      // Listar children directos (no falla el teardown si esto devuelve 5xx:
      // el outer reintenta toda la operacion, devolver null aca seria peor).
      const list = await api.get(`/api/category?parent=${encodeURIComponent(cid)}`);
      const listOk = list.ok();
      let children = [];
      if (listOk) {
        try {
          const body = await list.json();
          children = body?.data ?? [];
        } catch (_) {
          children = [];
        }
      }
      // Borrar descendientes primero (recursion 1 nivel por iteracion: si hay
      // nietos, vuelven a aparecer como children de su parent inmediato).
      for (const child of children) {
        if (child?._id && child._id !== cid) {
          await deleteTree(child._id);
        }
      }
      // Borrar este nodo.
      const r = await api.delete(`/api/category/${cid}`);
      const status = r.status();
      if (r.ok() || status === 404) {
        lastResponse = r;
        return r;
      }
      lastResponse = r;
      return r;
    };

    return deleteTree(id);
  },
  // Quiz: id compuesto "liveId/quizId" porque el quiz es sub-recurso del
  // live y su delete endpoint es /api/live-stream/:liveId/quizzes/:quizId.
  // (El ResourceCleaner hace split('/') para obtener ambos.)
  quiz: (api, compositeId) => {
    const [liveId, quizId] = String(compositeId).split('/');
    if (!liveId || !quizId) return { status: () => 0, ok: () => false };
    return api.delete(`/api/live-stream/${liveId}/quizzes/${quizId}`);
  },
  // Show: id simple (DELETE /api/show/:id). En este build de sm2 el endpoint
  // público observable es /api/show/list; POST/GET-by-id/DELETE no están
  // registrados en sm2/app.js — el deleter se incluye para que specs portados
  // desde api_test_flow funcionen cuando sm2 exponga esos endpoints.
  show: (api, id) => api.delete(`/api/show/${id}`),
  // Season: id compuesto "showId/seasonId" (DELETE /api/show/:showId/season/:seasonId).
  season: (api, compositeId) => {
    const [showId, seasonId] = String(compositeId).split('/');
    if (!showId || !seasonId) return { status: () => 0, ok: () => false };
    return api.delete(`/api/show/${showId}/season/${seasonId}`);
  },
  // Episode: id compuesto "showId/seasonId/episodeId"
  // (DELETE /api/show/:showId/season/:seasonId/episode/:episodeId).
  episode: (api, compositeId) => {
    const [showId, seasonId, episodeId] = String(compositeId).split('/');
    if (!showId || !seasonId || !episodeId) return { status: () => 0, ok: () => false };
    return api.delete(
      `/api/show/${showId}/season/${seasonId}/episode/${episodeId}`
    );
  },
  // User: deletable para fixtures qaUser/qaUserWithCategory. DELETE /api/user/:id
  // responde 200 con {data: null} y el GET siguiente da 404. Idempotente:
  // 404 se considera OK en resource-cleaner (res.ok() || status===404).
  // Cubre CAT-RISK-6: el bot puede borrar users que él mismo creo; antes no
  // podia porque nadie podia crearlos (mitigado por users-factory.createUser).
  user: (api, id) => api.delete(`/api/user/${id}`),
}

/**
 * Determina si un status amerita reintento. 5xx (server error transitorio)
 * y 429 (rate limit) si; 4xx (input invalido) no — reintentar 4xx no
 * cambia la respuesta y solo desperdicia tiempo.
 */
function shouldRetry(status) {
  return status === 0 || status === 429 || (status >= 500 && status < 600);
}

class ResourceCleaner {
  /**
   * @param {import('@playwright/test').APIRequestContext} api
   * @param {object} [opts]
   * @param {string} [opts.testId] Titulo del test, se envia al registry para
   *   auditoria. Si no se pasa, el registry no tendra testId en sus entries.
   * @param {number} [opts.maxAttempts] Override de MAX_ATTEMPTS (debug).
   */
  constructor(api, { testId, maxAttempts } = {}) {
    this.api = api
    this.testId = testId
    this.maxAttempts = maxAttempts || MAX_ATTEMPTS
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
    const leaked = []
    for (const res of [...this.resources]) {
      const deleter = DELETERS[res.type]
      if (!deleter) continue
      const result = await this._deleteWithRetry(deleter, res)
      if (result.ok) {
        this.registry.markDeleted(res.type, res.id, result.status)
      } else {
        // No se pudo borrar: queda como leaked en el registry, lo recoge
        // el globalTeardown.
        leaked.push({ ...res, status: result.status, error: result.error })
      }
    }
    this.resources = []

    if (leaked.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[AQ2 ResourceCleaner] ${leaked.length} recurso(s) leaked en test ` +
          `"${this.testId || '<sin-testId>'}": ` +
          leaked.map((l) => `${l.type}:${l.id} (status=${l.status})`).join(', ')
      )
    }

    // Persistir snapshot per-worker del registry. El archivo se sobreescribe
    // en cada test; el estado final es el de la ultima escritura.
    flush();
  }

  /**
   * Reintenta un delete con backoff exponencial. Devuelve {ok, status, error}.
   * @param {(api: any, id: string) => Promise<any>} deleter
   * @param {{type:string,id:string}} res
   */
  async _deleteWithRetry(deleter, res) {
    let lastStatus = 0;
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await deleter(this.api, res.id);
        const status = response.status();
        if (response.ok() || status === 404) {
          return { ok: true, status };
        }
        lastStatus = status;
        if (!shouldRetry(status)) {
          // 4xx (no transitorio): no reintentar.
          return { ok: false, status, error: `4xx sin reintento` };
        }
        if (attempt < this.maxAttempts) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      } catch (e) {
        lastError = String(e?.message || e);
        if (attempt < this.maxAttempts) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    return { ok: false, status: lastStatus, error: lastError };
  }
}

module.exports = { ResourceCleaner, shouldRetry };
