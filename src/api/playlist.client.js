// @ts-check
const { BaseClient } = require('./base.client');

/**
 * Cliente REST del contrato de **playlists** (familia `/api/playlist`).
 *
 * Una playlist agrupa medias bajo un `type`: manual | smart | series | playout.
 * El backend acepta el body como JSON (probado en vivo, dev v7.0.70) igual que
 * el form-urlencoded que envía la UI. La respuesta sigue el envelope estándar
 * de sm2: `{ status: 'OK'|'ERROR', data: <payload|codigo> }`.
 *
 * OJO (bug #36): crear sin `name` NO se valida — el backend revienta a nivel de
 * BD y responde 500 `{status:'ERROR',data:'DB_ERROR'}` en lugar de un 400.
 */
class PlaylistClient extends BaseClient {
  /** @param {import('@playwright/test').APIRequestContext} ctx */
  constructor(ctx) {
    super(ctx, '/api/playlist');
  }

  /**
   * Crea una playlist. `name` es obligatorio (ver bug #36). `type` default en
   * la UI es 'manual'. `uses_reels` marca la playlist como fuente de reels
   * (PR sm2#8076); si se omite, el backend la persiste en `false`.
   * @param {{ name?: string, type?: string, description?: string, medias?: string[], slug?: string, uses_reels?: boolean }} payload
   */
  create(payload) {
    return this.post('/', payload);
  }

  /**
   * Actualiza una playlist existente. OJO (verificado en vivo, dev v7.0.71): el
   * update es **POST /api/playlist/:id**, NO PUT (PUT responde 404). Acepta el
   * mismo body que create.
   * @param {string} id
   * @param {{ name?: string, type?: string, uses_reels?: boolean, [k: string]: any }} payload
   */
  update(id, payload) {
    return this.post(`/${id}`, payload);
  }

  /**
   * Listado de playlists. `params.uses_reels === true` filtra solo las marcadas
   * como fuente de reels (PR sm2#8076). El envelope trae `data` como array.
   * @param {{ uses_reels?: boolean }} [params]
   */
  list(params = {}) {
    const qs = new URLSearchParams();
    if (params.uses_reels) qs.set('uses_reels', 'true');
    const q = qs.toString();
    return this.get(q ? `/?${q}` : '/');
  }

  /** Detalle completo de una playlist (`?all=true`, como carga la vista de edición). */
  getById(id) {
    return this.get(`/${id}?all=true`);
  }

  /** Elimina una playlist. Responde 200 `{status:'OK',data:null}`. */
  remove(id) {
    return this.delete(`/${id}`);
  }
}

module.exports = { PlaylistClient };
