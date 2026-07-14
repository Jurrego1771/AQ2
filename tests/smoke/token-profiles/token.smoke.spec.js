// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * @smoke @token — la pantalla API and Tokens (/settings/api) carga para la cuenta QA.
 * Marcas cosechadas en vivo 2026-07-14. No requiere is_admin (el flujo read/write sí
 * es self-service; solo el campo Profile queda oculto, ver overview.md).
 */
test.describe('API Tokens @smoke @token', () => {
  test('la pantalla /settings/api carga con form y tabla de tokens @TOK-TC-014', async ({ tokenPage }) => {
    await tokenPage.goto();

    // Formulario de creación presente.
    await expect(tokenPage.description).toBeVisible();
    await expect(tokenPage.access).toBeVisible();
    await expect(tokenPage.createButton).toBeVisible();

    // Tabla + contador con un total numérico real (>=1: la cuenta QA ya tiene tokens).
    await expect(tokenPage.tokens).toBeVisible();
    await expect
      .poll(async () => Number.parseInt(await tokenPage.totalText(), 10), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    expect(await tokenPage.count()).toBeGreaterThanOrEqual(1);
  });
});
