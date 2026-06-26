// @ts-check
const { BaseClient } = require('./base.client');

/**
 * Cliente REST del contrato de **clips** del Live Editor (familia `/api/editor`).
 * El editor genera media a partir de cortes del DVR de un evento en vivo.
 * Cada método mapea 1:1 con un endpoint del contrato sm2 (routes/api/editor/*).
 */
class EditorClient extends BaseClient {
  /** @param {import('@playwright/test').APIRequestContext} ctx */
  constructor(ctx) {
    super(ctx, '/api/editor');
  }

  /**
   * Crea un job de clip/edición. El handler solo procesa `type: 'media'`
   * (genera media desde el DVR); `type: 'live'` u objeto inexistente devuelven
   * 400 INVALID_VIDEO_OBJECT. Sin `cdn_zone` en la cuenta -> 500 NO_CDN_ZONE_AVAILABLE.
   * @param {{ type: string, id: string, url?: string[], media_edit_type?: string, template?: string|null }} payload
   */
  createClip(payload) {
    return this.post('', payload);
  }

  /** Estado del job de transcodificación de un media editado. */
  jobStatus(mediaId) {
    return this.get(`/media/${mediaId}/job-status`);
  }

  /**
   * Genera un preview descargable de un meta. Requiere `id`, `type` y `meta_id`;
   * si falta alguno -> 400 BAD_REQUEST.
   * @param {Record<string, string|number|boolean>} payload
   */
  createPreview(payload) {
    return this.post('/create-preview', payload);
  }
}

/**
 * Cliente REST de los **datos** del Live Editor (familia `/api/live-editor`):
 * carga del editor de un evento, momentos, clips, thumbs, share y transcripción.
 */
class LiveEditorClient extends BaseClient {
  /** @param {import('@playwright/test').APIRequestContext} ctx */
  constructor(ctx) {
    super(ctx, '/api/live-editor');
  }

  /** Datos del editor para un live. Id inválido/inexistente -> 404 NOT_FOUND. */
  getByLiveId(liveStreamId) {
    return this.get(`/${liveStreamId}`);
  }

  /** Detalle de un media (clip) generado desde el editor de un live. */
  getClip(liveStreamId, mediaId) {
    return this.get(`/${liveStreamId}/media/${mediaId}`);
  }
}

module.exports = { EditorClient, LiveEditorClient };
