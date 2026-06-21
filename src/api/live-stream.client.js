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
  remove(id) {
    return this.delete(`/${id}`);
  }
  /** Grabaciones del evento. Sufijo /recording (ver bug #20). */
  recording(id) {
    return this.get(`/${id}/recording`);
  }
  /** Schedules onetime/recurrentes del evento (#18/#19 viven aquí). */
  scheduleJobs(id, query = {}) {
    return this.get(`/${id}/schedule-job`, { params: query });
  }
}

module.exports = { LiveStreamClient };
