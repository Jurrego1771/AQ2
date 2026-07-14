// @ts-check

/**
 * Wrapper sobre APIRequestContext que normaliza la respuesta a
 * `{ ok, status, body, headers }` (body parseado). Equivalente al `ApiClient`
 * de `api_test_flow/lib/apiClient.js` pero SIN inyectar `x-api-token`:
 * AQ2 autoriza por sesión (storageState del login) — el header se ignora en
 * esta plataforma.
 *
 * Uso típico en specs:
 *   const apiClient = new ApiClient(api);
 *   const res = await apiClient.post('/api/show', payload, { form: true });
 *   expect(res.ok).toBeTruthy();
 *   const created = res.body?.data ?? res.body;
 *
 * Si no necesitás el body parseado o querés control fino sobre el Response
 * (streaming, headers crudos, etc.), usá el fixture `api` directo.
 */
class ApiClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  async _wrap(responsePromise) {
    const res = await responsePromise;
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      // respuesta no-JSON: body queda null, ok=false según status.
    }
    return {
      ok: res.ok(),
      status: res.status(),
      body,
      headers: res.headers(),
    };
  }

  /** GET. Acepta opts Playwright (params, headers, etc.). */
  get(path, opts) {
    return this._wrap(this.ctx.get(path, opts));
  }

  /**
   * POST. Si opts.form === true usa url-encoded; si opts.multipart === true usa
   * multipart; si no, envía JSON. Pasá `data` como objeto plano.
   */
  post(path, data, opts = {}) {
    const { form, multipart, ...rest } = opts;
    const body = form ? { form: data } : multipart ? { multipart: data } : { data };
    return this._wrap(this.ctx.post(path, { ...body, ...rest }));
  }

  /** PUT JSON. */
  put(path, data, opts) {
    return this._wrap(this.ctx.put(path, { data, ...opts }));
  }

  /** DELETE. */
  delete(path, opts) {
    return this._wrap(this.ctx.delete(path, opts));
  }
}

module.exports = { ApiClient };