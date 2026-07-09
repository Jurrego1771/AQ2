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
 * @param {import('@playwright/test').APIRequestContext} api
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {'video'|'audio'} [opts.type]
 * @returns {Promise<string>} id del live-stream creado
 */
async function createLiveStream(api, { name, type = 'video' } = {}) {
  const title = name || `[QA-AUTO] Live ${Date.now()}`;
  return sem.get('live-stream').withPermit(async () => {
    const res = await api.post('/api/live-stream/', { data: { name: title, type } });
    if (!res.ok()) {
      throw new Error(`createLiveStream falló: HTTP ${res.status()} ${await res.text()}`);
    }
    const body = await res.json();
    const id = body?.data?._id || body?.data?.id;
    if (!id) throw new Error(`createLiveStream: respuesta sin id: ${JSON.stringify(body).slice(0, 200)}`);
    return id;
  });
}

module.exports = { createLiveStream };
