// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * @smoke @moai — MoAI Options (/settings/ai) carga sus controles de configuración.
 * Marcas cosechadas en vivo 2026-07-14. El módulo agrupa MCP Tokens, transcripción
 * (Deepgram/Whisper), imágenes (Gemini), prompts y modelos por feature.
 */
test.describe('MoAI Options @smoke @moai', () => {
  test('la pantalla /settings/ai carga con los controles de configuración de IA @MOAI-TC-6', async ({ moaiPage, page }) => {
    await moaiPage.goto();

    // Sección MCP Tokens (control estable, gate del goto).
    await expect(moaiPage.mcpTokenCreate).toBeVisible();
    await expect(moaiPage.mcpTokens).toBeVisible();

    // Botón global de guardar settings presente.
    await expect(moaiPage.save).toBeVisible();

    // Secciones clave del módulo renderizadas (headings cosechados en vivo).
    for (const heading of ['AI Audio Transcription', 'AI Images', 'MCP Tokens']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }

    // El modelo de imágenes es Gemini (config no-determinista, aquí solo su presencia).
    const imagesModel = page.locator('select').filter({ hasText: /gemini/i });
    await expect
      .poll(() => imagesModel.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
  });
});
