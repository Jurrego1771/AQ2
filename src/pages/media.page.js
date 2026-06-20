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

    // Búsqueda. El botón visible (lupa) es 'smart-search'; 'search' es el botón
    // oculto de Advanced Search. El envío se hace con Enter sobre el input.
    this.searchInput = page.locator(sm('query-title'));
    this.searchButton = page.locator(sm('smart-search'));

    // Modos de vista.
    this.displayGrid = page.locator(sm('display-grid'));
    this.displayList = page.locator(sm('display-list'));

    // Items del listado: la marca incluye el id del media. La página renderiza
    // los 3 layouts (grid/list/minimal) a la vez, así que filtramos :visible
    // para contar/leer solo el layout activo (ver issue #8).
    this.items = page.locator(`${smPrefix('media-container-')}:visible`);
    this.titles = page.locator(`${smPrefix('media-title-')}:visible`);
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
    await this.searchInput.press('Enter');
  }

  /** Limpia la búsqueda y vuelve a listar. */
  async clearSearch() {
    await this.searchInput.fill('');
    await this.searchInput.press('Enter');
  }

  /** @returns {Promise<number>} cantidad de cards visibles (layout activo). */
  async count() {
    return this.items.count();
  }

  /** @returns {Promise<string>} texto del contador "of N" (primer bloque). */
  async totalText() {
    return (await this.totalCount.first().innerText()).trim();
  }

  /** @returns {Promise<string[]>} títulos visibles, normalizados. */
  async visibleTitles() {
    return (await this.titles.allInnerTexts()).map((title) => title.trim());
  }

  /**
   * Deriva un término de búsqueda determinista de los títulos visibles: la
   * primera PALABRA puramente alfabética de >=4 chars. La búsqueda de Media
   * matchea palabras delimitadas (no subcadenas dentro de tokens unidos por
   * "_"; ver issue de semántica de búsqueda), por eso se evitan IDs/hashes.
   * Hace los tests robustos ante datos cambiantes (no hardcodea un título).
   * @returns {Promise<string|null>}
   */
  async firstResultToken() {
    // Las cards llegan por XHR tras la toolbar; espera a la primera.
    await this.titles.first().waitFor({ state: 'visible', timeout: 10_000 });
    const titles = await this.visibleTitles();
    for (const title of titles) {
      for (const raw of title.split(/\s+/)) {
        const word = raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
        if (/^[a-zA-Z]{4,}$/.test(word)) return word.toLowerCase();
      }
    }
    return null;
  }
}

module.exports = { MediaPage };
