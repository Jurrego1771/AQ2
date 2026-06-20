// @ts-check
const { request } = require('@playwright/test');

/**
 * Cliente REST base sobre el APIRequestContext de Playwright.
 * Los clientes por recurso (media.client.js, etc.) extienden de aquí.
 */
class BaseClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} ctx
   * @param {string} [resourcePath] prefijo del recurso, p.ej. "/api/media"
   */
  constructor(ctx, resourcePath = '') {
    this.ctx = ctx;
    this.resourcePath = resourcePath;
  }

  /**
   * Crea un cliente autenticado con un APIRequestContext propio.
   * @param {object} [opts]
   * @param {string} [opts.token] Bearer token
   * @param {string} [opts.baseURL]
   * @returns {Promise<import('@playwright/test').APIRequestContext>}
   */
  static async newContext({ token, baseURL } = {}) {
    return request.newContext({
      baseURL: baseURL || process.env.API_BASE_URL,
      extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  _url(path = '') {
    return `${this.resourcePath}${path}`;
  }

  async get(path = '', opts) {
    return this.ctx.get(this._url(path), opts);
  }
  async post(path = '', data, opts) {
    return this.ctx.post(this._url(path), { data, ...opts });
  }
  async put(path = '', data, opts) {
    return this.ctx.put(this._url(path), { data, ...opts });
  }
  async patch(path = '', data, opts) {
    return this.ctx.patch(this._url(path), { data, ...opts });
  }
  async delete(path = '', opts) {
    return this.ctx.delete(this._url(path), opts);
  }
}

module.exports = { BaseClient };
