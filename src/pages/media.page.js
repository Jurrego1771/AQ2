// @ts-check
const { sm, smPrefix } = require('../utils/selectors');

/**
 * Page Object del listado de Media (vista medias.coffee, ruta /media).
 *
 * REGLA: todos los selectores se resuelven con sm()/smPrefix() sobre marcas
 * [sm="..."]. Sin selectores por texto/clase/XPath. Marcas validadas en vivo
 * contra dev.platform.mediastre.am.
 */
class MediaPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Estructura de la página.
    this.toolbar = page.locator(sm('media-toolbar'));
    this.totalCount = page.locator(sm('total-medias'));
    this.loadingIcon = page.locator(sm('medias-loading-icon'));
    this.emptyState = page.locator(sm('no-result'));

    // Búsqueda.
    this.searchInput = page.locator(sm('query-title'));
    this.searchButton = page.locator(sm('search'));

    // Modos de vista.
    this.displayGrid = page.locator(sm('display-grid'));
    this.displayList = page.locator(sm('display-list'));

    // Items del listado: la marca incluye el id del media.
    this.items = page.locator(smPrefix('media-container-'));
    /** @param {string} id */
    this.item = (id) => page.locator(sm(`media-container-${id}`));
    /** @param {string} id */
    this.itemTitle = (id) => page.locator(sm(`media-title-${id}`));
  }

  /** Navega al listado y espera a que la toolbar sea visible. */
  async goto() {
    await this.page.goto('/media');
    await this.toolbar.waitFor({ state: 'visible' });
  }

  /** @param {string} term */
  async search(term) {
    await this.searchInput.fill(term);
    await this.searchButton.click();
  }

  /** @returns {Promise<number>} cantidad de cards de media visibles. */
  async count() {
    return this.items.count();
  }
}

module.exports = { MediaPage };
