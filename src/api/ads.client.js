// @ts-check
const { BaseClient } = require('./base.client');

/**
 * Cliente REST del recurso Ad (vista ads.coffee / ad.coffee en sm2).
 * Endpoints (verificados en app.js de sm2, lines 2701-2735):
 *   GET    /api/ad                       -> listado
 *   GET    /api/ad?count=true            -> total
 *   GET    /api/ad/:ad_id                -> detalle
 *   POST   /api/ad/new                   -> alta (literal 'new', no /api/ad/)
 *   POST   /api/ad/:ad_id                -> update (NO es PUT, contrato sm2)
 *   DELETE /api/ad/:ad_id                -> baja (cascade en media.ads[])
 *
 * Tipos validos en backend (create.js / update.js):
 *   vast | vmap | googleima | local | ad-insertion | adswizz
 *   | ad-insertion-google | ad-prebid
 * UI expone solo: vast (AdServer), vmap (VMAP), local (Media+Ad Replacement),
 * ad-insertion-google (Google MRSS Feed), ad-prebid (Prebid) - ver ADS-RISK-2.
 */
class AdsClient extends BaseClient {
  /** @param {import('@playwright/test').APIRequestContext} ctx */
  constructor(ctx) {
    super(ctx, '/api/ad');
  }

  /**
   * Listado. Por defecto el frontend pide limit=11 (raro: 12 per page deberia
   * ser 12; verificado en vivo) - lo respetamos tal cual.
   * @param {Record<string, string|number|boolean>} [query]
   */
  list(query = {}) {
    return this.get('', { params: { limit: 11, skip: 0, status: 0, query: '', ...query } });
  }

  /** @param {Record<string, string|number|boolean>} [query] */
  count(query = {}) {
    return this.get('', { params: { limit: 11, skip: 0, status: 0, query: '', count: true, ...query } });
  }

  /** @param {string} id */
  getById(id) {
    return this.get(`/${id}`);
  }

  /**
   * Crea un ad. Endpoint real: POST /api/ad/new (literal 'new'), NO /api/ad/.
   * El handler de create.js recibe el POST aunque :ad_id sea 'new' (no lo usa).
   * @param {object} [payload]
   */
  create(payload = {}) {
    return this.post('/new', payload);
  }

  /**
   * Update via POST a /:ad_id (contrato sm2; ver src/server/routes/api/ad/update.js).
   * @param {string} id
   * @param {object} payload
   */
  update(id, payload) {
    return this.post(`/${id}`, payload);
  }

  /** @param {string} id */
  remove(id) {
    return this.delete(`/${id}`);
  }
}

module.exports = { AdsClient };

