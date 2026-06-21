// @ts-check

/**
 * Crea un live-stream REAL por API y devuelve su id. Self-contained: el caller
 * (fixture) lo registra en el ResourceCleaner para borrarlo al terminar.
 *
 * A diferencia de media, un live-stream no requiere transcoding: el POST crea el
 * documento de inmediato (verificado en vivo). No hay gate que esperar.
 *
 * @param {import('@playwright/test').APIRequestContext} api
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {'video'|'audio'} [opts.type]
 * @returns {Promise<string>} id del live-stream creado
 */
async function createLiveStream(api, { name, type = 'video' } = {}) {
  const title = name || `[QA-AUTO] Live ${Date.now()}`;
  const res = await api.post('/api/live-stream/', { data: { name: title, type } });
  if (!res.ok()) {
    throw new Error(`createLiveStream falló: HTTP ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const id = body?.data?._id || body?.data?.id;
  if (!id) throw new Error(`createLiveStream: respuesta sin id: ${JSON.stringify(body).slice(0, 200)}`);
  return id;
}

module.exports = { createLiveStream };
