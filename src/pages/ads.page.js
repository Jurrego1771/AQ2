// @ts-check
const { sm, smPrefix, dataName } = require('../utils/selectors');

/**
 * Page Object del modulo Ads (vista ads.coffee / ad.coffee en sm2).
 * Rutas verificadas en vivo: listado `/ad` y form (new + detalle) `/ad/:id|new`.
 *
 * Marcas `sm:` y `data-name:` cosechadas en vivo contra dev.platform.mediastre.am.
 * Regla: en este modulo la mayoria de controles significativos tienen `sm:`. Los
 * multi-selects de Categorias/Tags/Referrers y el checkbox Published/Not Published
 * se serializan con `data-name` (`stable()` da una sola linea por ambos).
 *
 * Particularidades verificadas en vivo:
 * - Las filas del listado son `<tr sm="event" sm-id="<ObjectId>">`: la `sm-id`
 *   lleva el ObjectId (mismo patron que live-stream en `bookmark-<id>`).
 * - El contador `total-ads` refleja el total real de la API; NO incluye ads
 *   de otras cuentas. Senal estable para aserciones de cuenta.
 * - El selector "Type" expone 6 botones con solo 5 `sm:` unicos
 *   (Media + Ad Replacement comparten `sm="type-local"`); Ad Insertion (`ad-insertion`)
 *   no esta expuesto en la UI pero existen filas de ese tipo en el listado
 *   (legacy) - ver RISK ADS-RISK-2.
 * - 3 layouts de listado NO aplican aqui (es tabla, no grid/list/minimal).
 * - Sin `liveStreamPage`-style paginador "limit-per-page" con marcas: el dropdown
 *   usa `name="limit-per-page"` (sin `sm:`), se accede por role combobox.
 */
class AdsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // ---- Listado /ad ----
    this.searchInput = page.locator(sm('query-ad'));
    this.searchButton = page.locator(sm('search'));
    this.totalCount = page.locator(sm('total-ads'));
    this.currentSkip = page.locator(sm('current-skip'));
    this.dataList = page.locator(sm('data-list'));
    this.paginator = page.locator(sm('paginator')).first();
    this.paginatorNext = page.locator(sm('paginator-next')).first();
    this.paginatorPrev = page.locator(sm('paginator-prev')).first();
    this.newAdLink = page.locator('a[href="/ad/new"]');

    // Filas del listado. `sm-id` lleva el ObjectId del ad (mongo `_id`).
    this.rows = page.locator(`${sm('event')}[sm-id]`);
    /** @param {string} id */
    this.row = (id) => page.locator(`${sm('event')}[sm-id="${id}"]`);
    /** Row celdas por indice (estado, nombre, tipo, fecha). */
    this.statusCell = page.locator(`${sm('event')}[sm-id] td:nth-child(1)`);
    this.nameCell = page.locator(`${sm('event')}[sm-id] td:nth-child(2)`);
    this.typeCell = page.locator(`${sm('event')}[sm-id] td:nth-child(3)`);
    this.dateCell = page.locator(`${sm('event')}[sm-id] td:nth-child(4)`);

    // ---- Form /ad/new y /ad/:id ----
    this.nameInput = page.locator(sm('ad-name'));
    // Status es un toggle visual (Published/Not Published) que envuelve un
    // checkbox con `data-name="is_enabled"`. La UI clickea el wrapper.
    this.statusCheckbox = page.locator(dataName('is_enabled'));
    this.statusToggle = page.locator('[data-name="is_enabled"]').locator('xpath=..');
    this.saveButton = page.locator(sm('save'));

    // Selector de Type: 6 botones; Media + Ad Replacement comparten `sm="type-local"`.
    this.typeAdServer = page.locator(sm('type-vast'));    // AdServer (label)
    this.typeVmap = page.locator(sm('type-vmap'));
    this.typeMedia = page.locator(sm('type-local'));      // primer nodo: "Media"
    this.typeAdReplacement = page.locator(sm('type-local')); // segundo nodo: "Ad Replacement" -> mismo sm
    this.typeGoogleMrss = page.locator(sm('type-ad-insertion-google'));
    this.typePrebid = page.locator(sm('type-prebid'));

    // Secciones por tipo (visibilidad depende del tipo del ad).
    this.sectionAdServer = page.locator(sm('section-type-ad-server'));
    this.sectionVmap = page.locator(sm('section-type-vmap'));
    this.sectionLocalMedia = page.locator(sm('section-type-local-media'));
    this.sectionAdInsertion = page.locator(sm('section-type-ad-insertion'));
    this.sectionAdInsertionGoogle = page.locator(sm('section-type-ad-insertion-google'));
    this.sectionAdPrebid = page.locator(sm('section-type-ad-prebid'));

    // ---- VAST (default type) ----
    this.skipPreRoll = page.locator(sm('preroll-skip-at'));
    this.minMediaTimeLength = page.locator(sm('min-media-time-length'));
    this.prerollTag = page.locator(sm('preroll-tag'));
    this.prerollTagMobile = page.locator(sm('preroll-tag-mobile'));
    this.prerollParamsEdit = page.locator(sm('preroll-params-edit'));
    this.prerollParamsMobileEdit = page.locator(sm('preroll-params-mobile-edit'));
    this.addMidrollButton = page.locator(sm('add-midroll'));
    this.midrollFirst = page.locator(sm('midroll-0'));
    this.midrollParamsEdit = page.locator(sm('midroll-params-edit'));
    this.postrollTag = page.locator(sm('postroll-tag'));
    this.postrollParamsEdit = page.locator(sm('postroll-params-edit'));
    this.overlayPosition = page.locator(sm('overlay-position'));
    this.overlayTag = page.locator(sm('overlay-tag'));

    // ---- Pause Ad (en ad VAST) ----
    this.pauseadTag = page.locator(sm('pausead-tag'));
    this.pauseadTagMobile = page.locator(sm('pausead-tag-mobile'));
    this.pauseadDuration = page.locator(sm('pausead-duration'));
    this.pauseadDurationMobile = page.locator(sm('pausead-duration-mobile'));
    this.pauseadPositionSelect = page.locator(sm('pausead-position'));
    this.pauseadCloseButton = page.locator(sm('pausead-close-button'));
    this.pauseadCloseText = page.locator(sm('pausead-close-text'));
    this.pauseadViewMoreText = page.locator(sm('pausead-view-more-text'));

    // ---- VMAP / Local Media / Ad Insertion / Ad Insertion Google / Prebid ----
    this.vmapTag = page.locator(sm('vmap-tag'));
    this.vmapTagMobile = page.locator(sm('vmap-tag-mobile'));
    this.vmapParamsEdit = page.locator(sm('vmap-params-edit'));
    this.vmapMobileParamsEdit = page.locator(sm('vmap-mobile-params-edit'));
    this.localMediaDefaultDuration = page.locator(sm('local-media-default-duration'));
    this.prerollMedia = page.locator(sm('preroll-media'));
    this.postrollMedia = page.locator(sm('postroll-media'));
    this.adDecisionServer = page.locator(sm('ad-decision-server'));
    this.adInsertionLoop = page.locator(sm('ad-insertion-loop'));
    this.adInsertionAddLoop = page.locator(sm('ad-insertion-add-loop'));
    this.sourceIdGoogleDai = page.locator(sm('source-id-gdai'));
    this.hmacGoogleDai = page.locator(sm('hmac-gdai'));
    this.prebidType = page.locator(sm('ad-prebid-type'));
    this.prebidUnitCode = page.locator(sm('ad-prebid-unitCode'));
    this.prebidPageUrl = page.locator(sm('ad-prebid-pageUrl'));

    // ---- Scoping: Categories / Tags / Referrers (multi-selects con data-name) ----
    this.categoriesSelect = page.locator(dataName('categories'));
    this.tagsSelect = page.locator(dataName('tags'));
    this.referersSelect = page.locator(dataName('referers'));
  }

  /** Navega al listado y espera la toolbar visible (contador real). */
  async goto() {
    await this.page.goto('/ad');
    await this.searchInput.waitFor({ state: 'visible', timeout: 15_000 });
    // El primer request /api/ad?count=true define `total-ads`. Sin esto, el
    // aserto de conteo en smoke/regression corre contra DOM vacio.
    await this.totalCount.first().waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** @param {string} id */
  async gotoDetail(id) {
    await this.page.goto(`/ad/${id}`);
    await this.nameInput.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async gotoNew() {
    await this.page.goto('/ad/new');
    await this.nameInput.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Total real reportado por la API (sm="total-ads"), p.ej. 74. */
  async total() {
    const text = (await this.totalCount.first().innerText()).trim();
    return Number(text.replace(/[^\d]/g, ''));
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
   * Id del primer ad visible (derivado del `sm-id` de la fila). Util para
   * specs que luego navegan al detalle sin hardcodear ids.
   * @returns {Promise<string|null>}
   */
  async firstAdId() {
    await this.rows.first().waitFor({ state: 'visible', timeout: 10_000 });
    const id = await this.rows.first().getAttribute('sm-id');
    return id || null;
  }

  /**
   * Filas cuyo Name (columna 2) matchea un texto. Usar `poll` sobre
   * `count()` / `names()` para esperar refrescos async.
   * @param {string} name
   */
  async rowsContainingName(name) {
    const all = await this.nameCell.allInnerTexts();
    return all.filter((n) => n.includes(name));
  }

  /**
   * @returns {Promise<string[]>} textos de la columna "Type" de cada fila visible.
   */
  async visibleTypes() {
    return this.typeCell.allInnerTexts();
  }

  /**
   * Hace click en el boton Type segun el label visible. SOLO aplica a los 5
   * tipos con `sm:` unica. Ad Insertion NO tiene boton en la UI (legacy) -
   * ver RISK ADS-RISK-2.
   *
   * NOTA: "Media" y "Ad Replacement" comparten `sm="type-local"`; el primero
   * (label "Media") ocupa `nth(0)`, el segundo (label "Ad Replacement")
   * `nth(1)` - ver ADS-RISK-3.
   *
   * @param {'adServer'|'vmap'|'media'|'adReplacement'|'googleMrss'|'prebid'} kind
   */
  async selectType(kind) {
    let target;
    switch (kind) {
      case 'adServer': target = this.typeAdServer; break;
      case 'vmap': target = this.typeVmap; break;
      case 'media': target = this.typeMedia.nth(0); break;
      case 'adReplacement': target = this.typeMedia.nth(1); break;
      case 'googleMrss': target = this.typeGoogleMrss; break;
      case 'prebid': target = this.typePrebid; break;
      default: throw new Error(`Tipo desconocido: ${kind}`);
    }
    await target.click();
  }
}

module.exports = { AdsPage };
