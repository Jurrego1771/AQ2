// @ts-check
const { sm } = require('../utils/selectors');

/**
 * Page Object de MoAI Options (/settings/ai) — configuración de IA de la cuenta.
 * Marcas cosechadas en vivo 2026-07-14 (views/settings/ai/index.coffee).
 *
 * GAP de testabilidad: los botones "Add Prompt", "edit-prompt-<id>" e
 * "improve-prompt-<id>" NO tienen marca sm: (usan id/clase). Se documentan como
 * mejora low; el POM solo modela lo que sí tiene sm: (form de prompt, MCP tokens,
 * modelos por feature).
 */
class MoaiPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Modal de prompt (Add/Edit): campos con sm:.
    this.promptTitle = page.locator(sm('prompt-title'));
    this.promptText = page.locator(sm('prompt-text'));
    this.promptType = page.locator(sm('prompt-type'));
    this.savePrompt = page.locator(sm('save-prompt'));

    // MCP Tokens (mismo patrón que API tokens de /settings/api).
    this.mcpTokenDescription = page.locator(sm('mcp-token-description'));
    this.mcpTokenAccess = page.locator(sm('mcp-token-access'));
    this.mcpTokenExpiration = page.locator(sm('mcp-token-expiration'));
    this.mcpTokenCreate = page.locator(sm('mcp-token-create'));
    this.mcpTokens = page.locator(sm('mcp-tokens'));

    // Guardado global de settings.
    this.save = page.locator(sm('save'));
    this.globalAlert = page.locator(sm('global-alert'));
  }

  /** Navega a MoAI Options y espera un control estable del módulo. */
  async goto() {
    await this.page.goto('/settings/ai');
    await this.mcpTokenCreate.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Abre el modal "Add Prompt" de un feature (botón sin sm:, usa id). @param {string} feature */
  async openAddPrompt(feature = 'metadata') {
    await this.page.locator(`#add-${feature}-prompt`).click();
    await this.promptTitle.waitFor({ state: 'visible', timeout: 10_000 });
  }

  // ─── MCP Tokens ───────────────────────────────────────────────────────────
  // Un MCP token es un token de cuenta con el TokenProfile MoAI (isForMoAI). El
  // front resuelve ese profile y lo manda en el create; por eso el flujo self-
  // service se cubre por UI (el create por API puro requiere el profile id, que
  // el server no expone por un GET limpio — ver overview MoAI).

  /** Fila de MCP token cuyo Description coincide. @param {string} desc */
  mcpRow(desc) {
    return this.mcpTokens.locator('tr').filter({ hasText: desc });
  }

  /** Crea un MCP token via UI (access 'read' por defecto). @param {string} description */
  async createMcpToken(description, access = 'read') {
    await this.mcpTokenDescription.fill(description);
    await this.mcpTokenAccess.selectOption(access).catch(() => {});
    await this.mcpTokenCreate.click();
  }
}

module.exports = { MoaiPage };
