// @ts-check

/**
 * Crea un Ad REAL por API y devuelve su id. Self-contained: el caller (fixture)
 * lo registra en el ResourceCleaner para borrarlo al terminar.
 *
 * Validado contra src/server/routes/api/ad/create.js de sm2:
 *   - POST /api/ad/ 201 (en realidad 200 con jsonp {status:'OK', data: ad})
 *   - tipo por defecto: 'vast' (valido pero pedimos 'local' para no necesitar URLs)
 *   - is_enabled: el body llega como string 'true'/'false'; el backend coerce
 *     a Boolean via Boolean('true').
 *
 * @param {import('@playwright/test').APIRequestContext} api
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {'vast'|'vmap'|'local'|'ad-insertion-google'|'ad-prebid'} [opts.type]
 * @returns {Promise<string>} id del ad creado
 */
async function createAd(api, { name, type = 'local' } = {}) {
  const title = name || `[QA-AUTO] Ad ${Date.now()}`;
  const payload = {
    name: title,
    type,
    is_enabled: 'false',
  };
  if (type === 'local') {
    payload.schedule = { pre: '', post: '', mid: [] };
  }
  // Endpoint real verificado en sm2/app.js: POST /api/ad/new (literal 'new').
  // El handler en create.js ignora el :ad_id del path.
  const res = await api.post('/api/ad/new', { data: payload });
  if (!res.ok()) {
    throw new Error(`createAd falló: HTTP ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const id = body?.data?._id || body?.data?.id;
  if (!id) throw new Error(`createAd: respuesta sin id: ${JSON.stringify(body).slice(0, 200)}`);
  return id;
}

module.exports = { createAd };
