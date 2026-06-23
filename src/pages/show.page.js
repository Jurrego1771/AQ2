// @ts-check
const { sm, smPrefix } = require('../utils/selectors');

/**
 * Page Object del módulo Show (listado /show + detalle /show/:id).
 *
 * REGLA: selectores solo via sm()/smPrefix(). Excepción documentada:
 * - `newShowLink`: a[href="/show/new"] — no tiene sm: mark (gap #28).
 * Marcas cosechadas en vivo contra dev.platform.mediastre.am (2026-06-23).
 */
class ShowPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Búsqueda y toolbar del listado.
    this.searchInput = page.locator(sm('query-title'));
    this.searchButton = page.locator(sm('smart-search'));
    this.advancedSearchButton = page.locator(sm('btn-advanced-smart-search'));
    this.advancedSearchPanel = page.locator(sm('search-filter-container'));
    this.applySearchButton = page.locator(sm('advance-search-button'));
    this.cancelSearchButton = page.locator(sm('cancel-search-button'));
    this.loadingIcon = page.locator(sm('medias-loading-icon'));

    // Paginación del listado.
    this.totalCount = page.locator(sm('total-medias'));
    this.paginatorNext = page.locator(sm('paginator-next'));
    this.paginatorPrev = page.locator(sm('paginator-prev'));

    // Cards del listado. Sin marcas sm: en los títulos ni en el interior (gap #28).
    this.items = page.locator(smPrefix('show-container-'));
    /** @param {string} id */
    this.item = (id) => page.locator(sm(`show-container-${id}`));

    // Botón "New Show" — sin sm: mark; se localiza por href estable (gap #28).
    this.newShowLink = page.locator('a[href="/show/new"]');

    // Acciones del detalle.
    this.saveShow = page.locator(sm('save-show'));
    this.deleteShow = page.locator(sm('delete-show'));

    // Seasons / Episodes del detalle.
    this.addSeason = page.locator(sm('add-season'));
    this.addEpisode = page.locator(sm('add-episode'));
    this.saveSeasonButton = page.locator(sm('save-season'));
    this.seasonModalAlert = page.locator(sm('season-modal-alert'));
    this.saveEpisodeButton = page.locator(sm('save-season-episode'));
    this.episodeModalAlert = page.locator(sm('episode-modal-alert'));

    // Tab Categories del detalle.
    this.addCategoryButton = page.locator(sm('add-category'));
    this.categoryOrderInput = page.locator(sm('order-category'));
    this.categoriesTable = page.locator(sm('tab-content-categories-table'));

    // Alert global (validaciones, errores de red).
    this.globalAlert = page.locator(sm('global-alert'));
  }

  /** Navega al listado y espera la primera card visible. */
  async goto() {
    await this.page.goto('/show');
    await this.items.first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** @returns {Promise<number>} cantidad de cards visibles en la página actual. */
  async count() {
    return this.items.count();
  }

  /** @returns {Promise<string>} texto del contador total (ej. «24»). */
  async totalText() {
    return (await this.totalCount.first().innerText()).trim();
  }

  /** @param {string} term */
  async search(term) {
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
  }

  async clearSearch() {
    await this.searchInput.fill('');
    await this.searchInput.press('Enter');
  }

  /**
   * Id del primer show visible (extraído de la marca show-container-<id>).
   * @returns {Promise<string|null>}
   */
  async firstShowId() {
    await this.items.first().waitFor({ state: 'visible', timeout: 15_000 });
    const mark = await this.items.first().getAttribute('sm');
    const match = mark && /show-container-(.+)$/.exec(mark);
    return match ? match[1] : null;
  }

  /** Navega al detalle de un show y espera el botón Save. */
  async gotoDetail(id) {
    await this.page.goto(`/show/${id}`);
    await this.saveShow.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** Navega al formulario de creación. */
  async gotoNew() {
    await this.page.goto('/show/new');
    await this.globalAlert.waitFor({ state: 'attached' });
  }

  /** @returns {Promise<string>} texto del alert global (validación / error). */
  async alertText() {
    return (await this.globalAlert.innerText()).trim();
  }
}

module.exports = { ShowPage };
