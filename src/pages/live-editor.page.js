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
    this.clipItems = page.locator(`${sm('dvr-clip-list')} ${sm('media-clip')}`);
    this.createMedia = page.locator(sm('dvr-create-media'));
    this.createMediaWithTemplate = page.locator(sm('dvr-create-media-with-template'));
    this.useMoai = page.locator(sm('use-moai'));
    /** Botón de borrar del primer clip de la lista. */
    this.firstClipDelete = this.clipItems.first().locator(sm('sm-delete-clip'));

    // Duración total de la media a crear (suma de los clips cortados).
    this.mediaDuration = page.locator(sm('dvr-media-duration'));

    // Retención (encabezado del intervalo disponible).
    this.retention = page.locator('#current-interval');
  }

  /**
   * Duración total acumulada de los clips (segundos), leída del panel "Main Media
   * duration". Gray-box: lee la marca `dvr-media-duration` visible (el editor
   * renderiza 2 layouts), parseando HH:MM:SS. No actúa, solo lee.
   * @returns {Promise<number>}
   */
  async mainDurationSec() {
    return this.page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[sm="dvr-media-duration"]'));
      const el = els.find((e) => e.getBoundingClientRect().height > 0) || els[0];
      const parts = ((el && el.textContent) || '0:0:0').trim().split(':').map(Number);
      const [h, m, s] = parts.length === 3 ? parts : [0, 0, 0];
      return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
    });
  }

  /**
   * Navega al editor de un evento y espera el contenedor del editor visible.
   * @param {string} eventId
   */
  async goto(eventId) {
    await this.page.goto(`/live-editor/${eventId}`);
    await this.editorLive.waitFor({ state: 'visible' });
  }

  // --- Conducción del timeline (gray-box) ---------------------------------
  // El timeline es un canvas vis.js: no es direccionable solo por `sm`. Para
  // posicionar el scrubber usamos el date-picker REAL (`tl-date-from` + Go) y
  // los atajos de teclado REALES (i=cut-in, o=cut-out, c=cortar). Solo leemos
  // `window.liveEditor` para readiness/ventana DVR/timing (no para actuar).

  /**
   * Espera a que el player del editor esté listo y permita seleccionar tiempo.
   * @returns {Promise<boolean>} true si quedó listo dentro del timeout.
   */
  async waitReady(timeout = 20_000) {
    try {
      await this.page.waitForFunction(
        () => !!window.liveEditor && window.liveEditor.playerReady && window.liveEditor.canSelectTime,
        null,
        { timeout }
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Inicio de la ventana DVR (ISO) y su duración en segundos. */
  async dvrWindow() {
    return this.page.evaluate(() => ({
      dateStart: window.liveEditor.dateStart ? window.liveEditor.dateStart.toISOString() : null,
      durationSec: window.liveEditor.currentDuration || 0,
    }));
  }

  /** Limpia los clips de prueba en sessionStorage para un evento (determinismo). */
  async clearStoredClips(eventId) {
    await this.page.evaluate((eid) => {
      try {
        const raw = sessionStorage.getItem('event_medias_clips');
        const obj = raw ? JSON.parse(raw) : {};
        obj[eid] = [];
        sessionStorage.setItem('event_medias_clips', JSON.stringify(obj));
      } catch {
        /* noop */
      }
    }, eventId);
  }

  /** Posiciona el scrubber a `minutes` desde el inicio del DVR (date-picker + Go). */
  async seekToOffset(minutes) {
    await this.page.evaluate((mins) => {
      const le = window.liveEditor;
      const t = window.moment(le.dateStart).add(mins, 'minutes').format('DD-MM-YYYY HH:mm');
      const input = document.querySelector('[sm="tl-date-from"]');
      input.value = t;
      if (window.$) window.$(input).val(t);
      document.querySelector('[sm="go-click"]').click();
    }, minutes);
    // El seek del player es async (carga del segmento DVR).
    await this.page.waitForTimeout(2500);
  }

  /** Dispara un atajo de teclado del editor (tras quitar foco de inputs). */
  async pressShortcut(key) {
    const map = { i: 73, o: 79, c: 67 };
    await this.page.evaluate((kc) => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      document.dispatchEvent(new KeyboardEvent('keydown', { which: kc, keyCode: kc, bubbles: true }));
    }, map[key]);
    await this.page.waitForTimeout(300);
  }

  /**
   * Corta un clip entre dos offsets (en minutos desde el inicio del DVR) usando
   * date-picker + atajos i/o/c (ruta de usuario real).
   */
  async cutClipBetween(inMin, outMin) {
    await this.seekToOffset(inMin);
    await this.pressShortcut('i');
    await this.seekToOffset(outMin);
    await this.pressShortcut('o');
    await this.pressShortcut('c');
    await this.page.waitForTimeout(500);
  }
}

module.exports = { LiveEditorPage };
