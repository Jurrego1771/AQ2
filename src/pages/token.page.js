// @ts-check
const { sm } = require('../utils/selectors');

/**
 * Page Object de la pantalla API and Tokens (/settings/api).
 *
 * REGLA: selectores solo via sm(). Marcas cosechadas en vivo contra
 * dev.platform.mediastre.am (2026-07-14, cliente views/settings/api.coffee).
 *
 * El campo Profile (sm="token-profile") NO se cosecha: el front lo esconde salvo
 * USER.is_admin (ver knowledge-core/modules/token-profiles/overview.md, TOK-RISK-002).
 * Aquí solo modelamos el flujo self-service de tokens read/write, accesible con la
 * cuenta QA.
 */
class TokenPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Formulario de creación.
    this.description = page.locator(sm('token-description'));
    this.access = page.locator(sm('token-access')); // <select> read | write(=Read+Write)
    this.distributor = page.locator(sm('token-distributor'));
    this.expiration = page.locator(sm('token-expiration'));
    this.createButton = page.locator(sm('token-create'));

    // Listado.
    this.tokens = page.locator(sm('tokens')); // <tbody>
    this.rows = this.tokens.locator(sm('token')); // <tr> por token
    this.totalTokens = page.locator(sm('total-tokens'));
    this.globalAlert = page.locator(sm('global-alert'));
  }

  /** Navega a la pantalla y espera la tabla de tokens visible. */
  async goto() {
    await this.page.goto('/settings/api');
    await this.tokens.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** @returns {Promise<number>} cantidad de filas de token. */
  async count() {
    return this.rows.count();
  }

  /** @returns {Promise<string>} texto del contador total-tokens. */
  async totalText() {
    return (await this.totalTokens.first().innerText()).trim();
  }

  /**
   * Localiza la fila cuyo Description coincide exactamente.
   * @param {string} desc
   */
  row(desc) {
    return this.rows.filter({ hasText: desc });
  }

  /**
   * Crea un token via UI. `access` = 'read' | 'write' (write = Read+Write).
   * No espera el resultado: el wait/assert va en el spec.
   * @param {{ description: string, access?: 'read'|'write' }} opts
   */
  async create({ description, access = 'read' }) {
    await this.description.fill(description);
    await this.access.selectOption(access);
    await this.createButton.click();
  }

  /** Botón de acción dentro de la fila de `desc`. @param {string} desc */
  deleteButton(desc) {
    return this.row(desc).locator(sm('token-delete'));
  }

  /** @param {string} desc */
  toggleButton(desc) {
    return this.row(desc).locator(sm('token-toggle'));
  }

  /** @param {string} desc */
  editButton(desc) {
    return this.row(desc).locator(sm('token-edit'));
  }

  /** Texto de la columna Access de la fila (ej. 'Read' / 'Read+Write'). @param {string} desc */
  async accessText(desc) {
    return (await this.row(desc).innerText()).replace(/\s+/g, ' ').trim();
  }
}

module.exports = { TokenPage };
