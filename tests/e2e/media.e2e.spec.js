// @ts-check
const { test, expect } = require('../../src/fixtures');
const { seedAndVerifyMedia } = require('../../src/flows/media.flow');

/**
 * @e2e — solo flujos críticos (dinero/media). Setup por API, verificación por UI.
 */
test.describe('Media e2e @e2e', () => {
  test('un media creado por API es visible y buscable en la UI', async ({ mediaClient, mediaPage }) => {
    const { id, payload } = await seedAndVerifyMedia({ mediaClient, mediaPage });

    await expect(mediaPage.root).toBeVisible();
    expect(id).toBeTruthy();

    // Limpieza
    await mediaClient.remove(id);
  });
});
