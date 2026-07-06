// @ts-check
const { sm } = require('../utils/selectors');

/**
 * Page Object del form de playlist (vista playlist_detail, ruta /playlist/:id;
 * :id = "new" para crear) y del panel de Playlists dentro de /media.
 *
 * REGLA: selectores solo con sm() sobre marcas [sm="..."]. Marcas cosechadas en
 * vivo contra dev.platform.mediastre.am (v7.0.70).
 *
 * LIMITACIÓN CONOCIDA (bug #38): los campos de captura del form (Name, Description,
 * Slug, Categories y las reglas del tipo Smart) NO tienen marca sm:, por lo que
 * este POM solo expone contenedores/acciones estructurales. La captura de datos
 * a nivel de campo no es automatizable de forma robusta bajo la política sm:.
 */
class PlaylistPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Chrome de la app: presente en toda ruta válida; AUSENTE en la página 404
    // (que renderiza 0 marcas sm). Sirve para distinguir vista válida de 404.
    this.navHeaderMedia = page.locator(sm('nav-header-media'));

    // --- Form de playlist (/playlist/:id) ---
    // Selector de tipo (manual | smart | series | playout).
    this.playlistType = page.locator(sm('playlist-type'));
    // Tabla de medias del tipo manual.
    this.manualMediaList = page.locator(sm('manual-media-list'));
    // Reglas del tipo playout.
    this.playoutRuleList = page.locator(sm('playout-rule-list'));
    // Acciones del form.
    this.save = page.locator(sm('save'));
    this.deleteBtn = page.locator(sm('delete'));

    // --- Panel de Playlists dentro de /media ---
    // Contenedor <ul> del listado lateral. OJO: los <li>/<a> de cada playlist
    // NO tienen marca sm: individual (bug #38) — solo el contenedor la tiene.
    this.playlistList = page.locator(sm('playlist-list'));
    // Botón de crear smart playlist desde el listado de media.
    this.createSmartPlaylist = page.locator(sm('create-smart-playlist'));
  }

  /** Abre el form de playlist. `id="new"` para el flujo de creación. */
  async goto(id = 'new') {
    await this.page.goto(`/playlist/${id}`);
  }

  /** Abre /media (donde vive el panel de playlists). */
  async gotoMedia() {
    await this.page.goto('/media');
  }
}

module.exports = { PlaylistPage };
