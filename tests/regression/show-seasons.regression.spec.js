// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * Regresión — Show: creación de seasons.
 * test.fail() = prueba viva; se espera rojo hasta que se corrija el issue.
 * Comportamiento validado en vivo contra dev.platform.mediastre.am (2026-06-23).
 */
test.describe('Show seasons @regression @show', () => {
  // Show creado durante la exploración QA en la cuenta jurrego-qa-sandbox.
  const SHOW_ID = '6a3ab60f6878b5ea63aae8a0';

  test.beforeEach(async ({ showPage }) => {
    await showPage.gotoDetail(SHOW_ID);
  });

  // --- Prueba viva del bug #25 ---
  test(
    'Save con season vacía muestra validación en lugar de lanzar TypeError [BUG #25] @SHW-TC-005',
    async ({ showPage, page }) => {
      test.fail(
        true,
        'BUG #25: saveSeason() lanza TypeError en lugar de mostrar season-modal-alert — https://github.com/Jurrego1771/AQ2/issues/25'
      );

      await showPage.addSeason.click();
      // El campo title se deja vacío.
      await showPage.saveSeasonButton.click();

      // Esperado (post-fix): el alert del modal es visible con un mensaje de error.
      await expect(showPage.seasonModalAlert).toBeVisible();
      expect(await showPage.seasonModalAlert.innerText()).toMatch(/required|obligatorio/i);

      // La consola NO debe tener el TypeError de saveSeason.
      const errors = await page.evaluate(() =>
        window.__playwrightErrors?.filter((e) => /saveSeason/.test(e)) ?? []
      );
      expect(errors).toHaveLength(0);
    }
  );

  // --- Prueba viva del bug #26 ---
  test(
    'POST /show/:id/season debe retornar 201 al guardar con título válido [BUG #26] @SHW-TC-006',
    async ({ showPage, page }) => {
      test.fail(
        true,
        'BUG #26: POST /show/<id>/season falla con ERR_FAILED (CORS/network) — https://github.com/Jurrego1771/AQ2/issues/26'
      );

      // Intercept the season POST to capture status.
      let seasonStatus = null;
      page.on('response', (res) => {
        if (res.url().includes('/season') && res.request().method() === 'POST') {
          seasonStatus = res.status();
        }
      });

      await showPage.addSeason.click();
      await page.locator('input[name="show-season-title"]').fill('QA Season Auto');
      await showPage.saveSeasonButton.click();

      // Esperado (post-fix): el modal se cierra y se crea el season.
      await expect
        .poll(() => seasonStatus, { timeout: 10_000 })
        .toBe(201);
      await expect(showPage.seasonModalAlert).not.toBeVisible();
    }
  );
});
