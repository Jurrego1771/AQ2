// @ts-check
const { sm, smPrefix } = require('../utils/selectors');

/**
 * Page Object del listado de Live Stream (vista live_streams.coffee, ruta /live-stream).
 *
 * REGLA: selectores solo con sm()/smPrefix() sobre marcas [sm="..."]. Marcas
 * cosechadas en vivo contra dev.platform.mediastre.am.
 *
 * Particularidades del módulo (verificadas en vivo):
 * - El contador `total-live-streams` refleja el total real de la API y es la
 *   señal estable entre layouts (la marca de card `live-container-<id>` existe
 *   SOLO en el layout grid; en list/minimal las cards usan `bookmark-<id>`).
 * - Los filtros Video/Audio/Favorites comparten la marca `sm="top-filter"` y
 *   Published/Not Published/Online/Offline comparten `sm="top-filter-dropdown"`
 *   → no son direccionables por sm único; se localizan por índice/orden
 *   (tech-debt #22). Por eso aquí se usa `.nth()` documentado, no texto.
 */
class LiveStreamPage {
  /** Orden real de los chips `top-filter` en el toolbar (cosechado en vivo). */
  static TOP_FILTER_INDEX = { video: 0, audio: 1, favorites: 2 };

  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Toolbar / estructura.
    this.searchInput = page.locator(sm('query-event'));
    this.searchButton = page.locator(sm('search'));
    this.totalCount = page.locator(sm('total-live-streams'));
    this.paginator = page.locator(sm('paginator')).first();
    this.paginatorNext = page.locator(sm('paginator-next')).first();
    this.paginatorPrev = page.locator(sm('paginator-prev')).first();

    // Modos de vista (3 layouts coexisten).
    this.displayGrid = page.locator(sm('display-grid'));
    this.displayList = page.locator(sm('display-list'));
    this.displayMinimal = page.locator(sm('display-minimal-list'));

    // Filtros de tipo (chips). Comparten marca → por índice (ver #22).
    this.topFilters = page.locator(sm('top-filter'));
    this.topFilterDropdown = page.locator(sm('top-filter-dropdown'));

    // Cards. `bookmark-<id>` está en todos los layouts (estable); el id del
    // evento va embebido en la marca.
    this.cards = page.locator(`${smPrefix('bookmark-')}:visible`);
    /** @param {string} id */
    this.card = (id) => page.locator(sm(`live-container-${id}`));

    // Crear.
    this.newVideoLink = page.locator('a[href="/live-stream/new"]');
    this.newAudioLink = page.locator('a[href="/live-stream/new?type=audio"]');
  }

  /** Navega al listado y espera la toolbar (input de búsqueda) visible. */
  async goto() {
    await this.page.goto('/live-stream');
    await this.searchInput.waitFor({ state: 'visible' });
  }

  /** @returns {Promise<number>} total real de la API (contador `total-live-streams`). */
  async total() {
    const text = (await this.totalCount.first().innerText()).trim();
    return Number(text.replace(/[^\d]/g, ''));
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

  /**
   * Aplica (o quita, si ya estaba activo) un filtro de tipo. Solo hace click; el
   * test espera el resultado con expect.poll sobre total().
   * @param {'video'|'audio'|'favorites'} type
   */
  async filterByType(type) {
    await this.topFilters.nth(LiveStreamPage.TOP_FILTER_INDEX[type]).click();
  }

  /**
   * @param {'video'|'audio'|'favorites'} type
   * @returns {Promise<boolean>} true si el chip está marcado activo.
   */
  async isTypeFilterActive(type) {
    return this.topFilters
      .nth(LiveStreamPage.TOP_FILTER_INDEX[type])
      .evaluate((el) => /\bactive\b/.test(el.className) || /\bactive\b/.test(el.closest('li,a')?.className || ''));
  }

  /**
   * Id del primer evento visible (derivado de la marca `bookmark-<id>`). Sirve
   * para abrir un detalle sin hardcodear ids.
   * @returns {Promise<string|null>}
   */
  async firstStreamId() {
    await this.cards.first().waitFor({ state: 'visible', timeout: 10_000 });
    const mark = await this.cards.first().getAttribute('sm');
    const match = mark && /bookmark-(.+)$/.exec(mark);
    return match ? match[1] : null;
  }
}

module.exports = { LiveStreamPage };
