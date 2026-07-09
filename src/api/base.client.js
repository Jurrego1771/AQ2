// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { request } = require('@playwright/test');

/**
 * Cliente REST base sobre el APIRequestContext de Playwright.
 * Los clientes por recurso (media.client.js, etc.) extienden de aquí.
 *
 * Convenciones de body (mutuamente excluyentes):
 *   - `post(path, data)`              -> JSON body (default)
 *   - `postForm(path, fields)`        -> url-encoded form body
 *   - `postMultipart(path, fields)`   -> multipart/form-data (uploads)
 *   - `put/patch` siguen el patrón JSON.
 *
 * Para Playwright, `data` y `form`/`multipart` son excluyentes; este wrapper
 * evita el conflicto y libera al caller de tener que recordar cuál usar.
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

  /**
   * POST con body url-encoded. Usar cuando el server espera `application/x-www-form-urlencoded`
   * (muchos handlers sm2 lo prefieren sobre JSON para forms de admin).
   * @param {string} path
   * @param {Record<string, any>} fields
   * @param {object} [opts] Extras Playwright (headers, params, etc.). NO incluir `form`/`data`.
   */
  async postForm(path = '', fields, opts = {}) {
    return this.ctx.post(this._url(path), { form: fields, ...opts });
  }

  /**
   * POST multipart/form-data. Usar para uploads (logo, thumb, video).
   *
   * `fields` es un objeto donde cada entry puede ser:
   *   - `string` (path a archivo) -> se lee como buffer con `name` derivado del basename
   *     y `mimeType` por extensión (png/jpg/jpeg/gif/webp/pdf).
   *   - `{ buffer, name?, mimeType? }` -> se envía como buffer explícito.
   *   - valor escalar -> se envía como campo de texto (campo de form normal).
   *
   * Ejemplo:
   *   client.postMultipart('/logo', { attach: 'tests/resources/logo.png' })
   *   client.postMultipart('/thumb', { thumb: { buffer, name: 'x.png', mimeType: 'image/png' } })
   *
   * @param {string} path
   * @param {Record<string, any>} fields
   * @param {object} [opts]
   */
  async postMultipart(path = '', fields, opts = {}) {
    const multipart = {};
    for (const [field, value] of Object.entries(fields)) {
      multipart[field] = BaseClient._coerceMultipartField(value);
    }
    return this.ctx.post(this._url(path), { multipart, ...opts });
  }

  /**
   * Convierte un valor a la forma que espera Playwright `multipart`:
   *  - string que parece path -> { name, mimeType, buffer }
   *  - string que NO parece path -> string (campo de texto)
   *  - objeto con `buffer` -> pasa tal cual (con defaults de name/mimeType)
   *  - stream / buffer -> pasa tal cual
   * @param {any} value
   * @returns {any}
   */
  static _coerceMultipartField(value) {
    if (value == null) return value;
    // Stream o Buffer: pasa tal cual (Playwright los acepta).
    if (typeof value === 'object' && (value.pipe || Buffer.isBuffer(value))) {
      return value;
    }
    // string path a archivo
    if (typeof value === 'string') {
      // Heuristica: si existe como archivo, leerlo; si no, tratar como texto.
      if (fs.existsSync(value) && fs.statSync(value).isFile()) {
        const buf = fs.readFileSync(value);
        const name = path.basename(value);
        const mimeType = BaseClient._guessMimeType(name);
        return { name, mimeType, buffer: buf };
      }
      return value; // campo de texto
    }
    // objeto con `buffer`: completa defaults.
    if (typeof value === 'object' && value.buffer) {
      return {
        name: value.name || 'file',
        mimeType: value.mimeType || 'application/octet-stream',
        buffer: value.buffer,
      };
    }
    return value;
  }

  static _guessMimeType(filename) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    const map = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      webm: 'video/webm',
      txt: 'text/plain',
    };
    return map[ext] || 'application/octet-stream';
  }
}

module.exports = { BaseClient };
