// @ts-check
const { BaseClient } = require('./base.client');

/**
 * Cliente REST del recurso Live Stream (vista live_streams.coffee / live_stream.coffee).
 * Cada método mapea 1:1 con un endpoint del contrato sm2 (/api/live-stream).
 */
class LiveStreamClient extends BaseClient {
  /** @param {import('@playwright/test').APIRequestContext} ctx */
  constructor(ctx) {
    super(ctx, '/api/live-stream');
  }

  /**
   * Listado. El admin pide siempre con `count=true` para el total y otra
   * llamada sin count para los datos; aquí exponemos el query crudo.
   * @param {Record<string, string|number|boolean>} [query]
   */
  list(query = {}) {
    return this.get('', { params: { all: true, limit: 12, skip: 0, ...query } });
  }
  /** @param {Record<string, string|number|boolean>} [query] total de resultados (count=true). */
  count(query = {}) {
    return this.get('', { params: { all: true, limit: 12, skip: 0, count: true, ...query } });
  }
  getById(id) {
    return this.get(`/${id}`);
  }
  create(payload) {
    return this.post('/', payload);
  }
  /**
   * Update parcial del evento. El contrato sm2 es POST /:id (no PUT) con body
   * parcial: cualquier subset de campos actualizables (name, dvr, ad, player,
   * logo_live_position, etc.). La implementación de sm2 acepta tanto JSON
   * como form-encoded; JSON es más predecible para tests.
   * @param {string} id
   * @param {Record<string, any>} payload
   */
  update(id, payload) {
    return this.post(`/${id}`, payload);
  }
  remove(id) {
    return this.delete(`/${id}`);
  }
  /** Grabaciones del evento. Sufijo /recording (ver bug #20). */
  recording(id) {
    return this.get(`/${id}/recording`);
  }

  // --- Estado online / bookmark (toggles) ---
  toggleOnline(id) {
    return this.post(`/${id}/toggle-online`, {});
  }
  toggleBookmark(id) {
    return this.post(`/${id}/toggle-bookmark`, {});
  }
  /** Regenera el publishing token del evento. */
  refreshToken(id) {
    return this.post(`/${id}/refresh-token`, {});
  }
  /** Inicia grabacion del evento. Endpoint verificado: /start-record. */
  startRecord(id) {
    return this.post(`/${id}/start-record`, {});
  }
  /** Lista thumbnails del evento. */
  listThumbs(id) {
    return this.get(`/${id}/thumb`);
  }
  /** Lista restream targets del evento. */
  listRestream(id) {
    return this.get(`/${id}/restream`);
  }

  // --- Logo (multipart upload + delete) ---
  // El server espera multipart con un campo `attach` (verificado en vivo).
  // Acepta path, buffer o stream (ver BaseClient.postMultipart).
  uploadLogo(id, file) {
    return this.postMultipart(`/${id}/logo`, { attach: file });
  }
  deleteLogo(id) {
    return this.delete(`/${id}/logo`);
  }

  // --- Thumbnails (multipart upload + set-default + delete) ---
  // El server espera multipart con un campo `thumb` (verificado en vivo).
  uploadThumb(id, file) {
    return this.postMultipart(`/${id}/thumb`, { thumb: file });
  }
  /** Marca un thumb existente como default. */
  setDefaultThumb(id, thumbId) {
    return this.post(`/${id}/thumb/${thumbId}`, {});
  }
  deleteThumb(id, thumbId) {
    return this.delete(`/${id}/thumb/${thumbId}`);
  }

  // --- Quizzes (sub-recurso del live) ---
  // Contrato sm2 (verificado en vivo): el id del quiz se llama `id` (no `_id`)
  // en el response de create, y la lista usa `quizzes:` (no `data:`). Manejo
  // de quirks centralizado en el spec.
  listQuizzes(id) {
    return this.get(`/${id}/quizzes`);
  }
  /** Crea un quiz. Devuelve 201 Created con body { status:"OK", quiz:{...} }. */
  createQuiz(id, payload) {
    return this.post(`/${id}/quizzes`, payload);
  }
  /** Update: requiere payload completo (title + questions), no es patch. */
  updateQuiz(id, quizId, payload) {
    return this.post(`/${id}/quizzes/${quizId}`, payload);
  }
  /** Envia el quiz a la audiencia. Requiere que el live este online. */
  sendQuiz(id, quizId) {
    return this.post(`/${id}/quizzes/${quizId}/send`, {});
  }
  deleteQuiz(id, quizId) {
    return this.delete(`/${id}/quizzes/${quizId}`);
  }

  // --- Schedules (onetime / recurrent). Contrato verificado en vivo ---

  /**
   * Lista los schedules del evento. Por defecto el server filtra
   * date_end >= now; usar { all: 'true' } para incluir pasados, o
   * { is_past: 'true' } para solo pasados.
   */
  scheduleJobs(id, query = {}) {
    return this.get(`/${id}/schedule-job/`, { params: query });
  }
  /** Detalle de un schedule. */
  scheduleJob(id, scheduleJobId) {
    return this.get(`/${id}/schedule-job/${scheduleJobId}`);
  }
  /**
   * Detalle de un schedule via el endpoint singular /schedule/:sid.
   * Distinto de /schedule-job/:sid: este es el que devuelve EventSchedule como
   * array (ver src/server/routes/api/live-stream/schedule/detail.js). Antes del
   * fix sm2#8496 un resultado [] respondia 200 con data:[] (truthy en JS); el
   * fix usa _.isEmpty() y devuelve 404 NOT_FOUND cuando no hay resultados.
   */
  schedule(id, scheduleId) {
    return this.get(`/${id}/schedule/${scheduleId}`);
  }
  /** Crea un schedule (POST a /schedule-job/). */
  createScheduleJob(id, payload) {
    return this.post(`/${id}/schedule-job/`, payload);
  }
  /** Actualiza un schedule. OJO: el contrato sm2 es POST a /:scheduleJobId (no PUT). */
  updateScheduleJob(id, scheduleJobId, payload) {
    return this.post(`/${id}/schedule-job/${scheduleJobId}`, payload);
  }
  /** Borra un schedule. */
  removeScheduleJob(id, scheduleJobId) {
    return this.delete(`/${id}/schedule-job/${scheduleJobId}`);
  }
}

module.exports = { LiveStreamClient };
