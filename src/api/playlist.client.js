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
   * la UI es 'manual'.
   * @param {{ name?: string, type?: string, description?: string, medias?: string[], slug?: string }} payload
   */
  create(payload) {
    return this.post('/', payload);
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
