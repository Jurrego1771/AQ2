// @ts-check
const { BaseClient } = require('./base.client');

/**
 * Cliente REST del recurso Media (sobre el Swagger de sm2).
 * Cada método mapea 1:1 con un endpoint del contrato.
 */
class MediaClient extends BaseClient {
  /** @param {import('@playwright/test').APIRequestContext} ctx */
  constructor(ctx) {
    super(ctx, '/api/media');
  }

  list(query = {}) {
    return this.get('', { params: query });
  }
  getById(id) {
    return this.get(`/${id}`);
  }
  create(payload) {
    return this.post('', payload);
  }
  update(id, payload) {
    return this.put(`/${id}`, payload);
  }
  remove(id) {
    return this.delete(`/${id}`);
  }
}

module.exports = { MediaClient };
