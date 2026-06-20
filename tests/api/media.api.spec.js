// @ts-check
const { test, expect } = require('../../src/fixtures');
const { mediaItem } = require('../../src/fixtures/data.factory');

/**
 * @api — contrato + CRUD + RBAC negativo. Aquí vive el grueso de la suite.
 */
test.describe('Media API @api', () => {
  test('CRUD: crea, lee, actualiza y elimina un media', async ({ mediaClient }) => {
    // CREATE
    const created = await mediaClient.create(mediaItem());
    expect(created.status(), await created.text()).toBe(201);
    const { id } = await created.json();

    // READ
    const read = await mediaClient.getById(id);
    expect(read.ok()).toBeTruthy();

    // UPDATE
    const updated = await mediaClient.update(id, { title: 'titulo-actualizado' });
    expect(updated.ok()).toBeTruthy();

    // DELETE
    const removed = await mediaClient.remove(id);
    expect(removed.ok()).toBeTruthy();
  });

  test('contrato: list devuelve forma esperada', async ({ mediaClient }) => {
    const res = await mediaClient.list({ page: 1, size: 10 });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.items ?? body)).toBeTruthy();
  });
});
