// @ts-check
const { sm } = require('../utils/selectors');

/**
 * Page Object del editor de un evento (vista live_editor_detail.coffee,
 * ruta /live-editor/:event_id).
 *
 * REGLA: selectores solo con sm() sobre marcas [sm="..."]. Marcas cosechadas en
 * vivo contra dev.platform.mediastre.am (89 marcas únicas, v7.0.67).
 *
 * Acciones simples; el wait/assert async va en el spec con expect.poll. La
 * mayoría de los flujos de corte/creación de clip dependen de buffer DVR.
 */
class LiveEditorPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Timeline / DVR.
    this.editorLive = page.locator(sm('dvr-editor-live'));
    this.timeline = page.locator(sm('timeline'));
    this.goLive = page.locator(sm('go-live'));
    this.goClick = page.locator(sm('go-click'));
    this.dateFrom = page.locator(sm('tl-date-from'));
    this.playPause = page.locator(sm('dvr-play-pause-button'));
    this.volume = page.locator(sm('dvr-volume'));
    this.moveBackward = page.locator(sm('move-backward'));
    this.moveForward = page.locator(sm('move-forward'));
    this.zoomIn = page.locator(sm('zoomIn'));
    this.zoomOut = page.locator(sm('zoomOut'));

    // Selección / corte.
    this.cutLeft = page.locator(sm('tl-cut-left'));
    this.cutRight = page.locator(sm('tl-cut-right'));
    this.cutClip = page.locator(sm('dvr-cut-clip'));

    // Clips y creación de media.
    this.clipList = page.locator(sm('dvr-clip-list'));
    this.clipsMessage = page.locator(sm('dvr-clips-message'));
    this.createMedia = page.locator(sm('dvr-create-media'));
    this.createMediaWithTemplate = page.locator(sm('dvr-create-media-with-template'));
    this.useMoai = page.locator(sm('use-moai'));

    // Retención (encabezado del intervalo disponible).
    this.retention = page.locator('#current-interval');
  }

  /**
   * Navega al editor de un evento y espera el contenedor del editor visible.
   * @param {string} eventId
   */
  async goto(eventId) {
    await this.page.goto(`/live-editor/${eventId}`);
    await this.editorLive.waitFor({ state: 'visible' });
  }
}

module.exports = { LiveEditorPage };
