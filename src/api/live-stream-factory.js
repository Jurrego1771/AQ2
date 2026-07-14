// @ts-check
const sem = require('../utils/semaphore');

/**
 * Crea un live-stream REAL por API y devuelve su id. Self-contained: el caller
 * (fixture) lo registra en el ResourceCleaner para borrarlo al terminar.
 *
 * A diferencia de media, un live-stream no requiere transcoding: el POST crea el
 * documento de inmediato (verificado en vivo). No hay gate que esperar.
 *
 * Concurrencia: pasa por el semáforo 'live-stream' (Capa 7 de la estrategia)
 * para no martillar el dev compartido cuando varios workers crean en paralelo.
 * Activar con QA_MAX_CONCURRENT_CREATE=N (default 0 = desactivado).
 *
 * Robustez: ante 502/503/504 (transient infra, nginx/gateway upstreams
 * caidos momentáneamente bajo carga del dev compartido), reintenta con
 * backoff 1s, 2s, 4s. NO reintenta en 4xx ni en 500 (5xx != 5xx transient):
 * un 500 suele ser bug de producto y reintentar lo enmascara. Los 502/503/504
 * son tipicamente "upstream unavailable" y un retry legitimo los resuelve.
 *
 * @param {import('@playwright/test').APIRequestContext} api
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {'video'|'audio'} [opts.type]
 * @returns {Promise<string>} id del live-stream creado
 */
async function createLiveStream(api, { name, type = 'video' } = {}) {
  const title = name || `[QA-AUTO] Live ${Date.now()}`;
  return sem.get('live-stream').withPermit(async () => {
    const TRANSIENT = new Set([502, 503, 504]);
    const MAX_RETRIES = 3;
    const BACKOFFS_MS = [1000, 2000, 4000];
    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const res = await api.post('/api/live-stream/', { data: { name: title, type } });
      if (res.ok()) {
        const body = await res.json();
        const id = body?.data?._id || body?.data?.id;
        if (!id) throw new Error(`createLiveStream: respuesta sin id: ${JSON.stringify(body).slice(0, 200)}`);
        return id;
      }
      const status = res.status();
      const body = await res.text();
      lastErr = `HTTP ${status} ${body.slice(0, 120)}`;
      if (!TRANSIENT.has(status) || attempt === MAX_RETRIES) {
        throw new Error(`createLiveStream falló: ${lastErr}`);
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[createLiveStream] intento ${attempt + 1}/${MAX_RETRIES + 1} respondio ${status} (transient), reintentando en ${BACKOFFS_MS[attempt]}ms`
      );
      await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]));
    }
    throw new Error(`createLiveStream: agoto reintentos (${lastErr})`);
  });
}

module.exports = { createLiveStream };
