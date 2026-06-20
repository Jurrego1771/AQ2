// @ts-check
const { mediaItem } = require('../fixtures/data.factory');

/**
 * Flujos de negocio compuestos (UI + API).
 * Combinan setup rápido por API con verificación por UI para mantener
 * los e2e veloces y enfocados en el flujo crítico, no en el plumbing.
 */

/**
 * Crea un media por API y verifica que aparece en la UI.
 * @param {object} deps
 * @param {import('../api/media.client').MediaClient} deps.mediaClient
 * @param {import('../pages/media.page').MediaPage} deps.mediaPage
 * @param {object} [overrides] overrides del payload
 * @returns {Promise<{ id: string, payload: object }>}
 */
async function seedAndVerifyMedia({ mediaClient, mediaPage }, overrides = {}) {
  const payload = mediaItem(overrides);
  const res = await mediaClient.create(payload);
  if (!res.ok()) {
    throw new Error(`Fallo al crear media por API: ${res.status()} ${await res.text()}`);
  }
  const { id } = await res.json();

  await mediaPage.goto();
  await mediaPage.search(payload.title);

  return { id, payload };
}

module.exports = { seedAndVerifyMedia };
