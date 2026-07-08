// @ts-check
const { sm, dataName, stable } = require('../utils/selectors');

/**
 * Page Object del form de playlist (vista playlist_detail, ruta /playlist/:id;
 * :id = "new" para crear) y del panel de Playlists dentro de /media.
 *
 * REGLA (escalera de selectores estables, ver CLAUDE.md): se prefiere sm() y se
 * admite dataName()/stable() como fallback semántico. Marcas cosechadas en vivo
 * contra dev.platform.mediastre.am (form v7.0.71).
 *
 * NOTA (bug #38): los campos de captura del form (Name, Slug, checkbox 'Use for
 * reels', reglas Smart) aún NO tienen marca sm:, pero SÍ exponen `data-name`
 * (la app lo usa para serializar el form). Se direccionan con dataName()/stable()
 * — estable de facto — y se migrarán a sm: cuando el front las agregue.
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

    // --- Campos de captura del form (fallback data-name, bug #38) ---
    // Nombre de la playlist (obligatorio; sin él el backend responde 500, bug #36).
    this.nameInput = page.locator(stable('name'));
    // Checkbox 'Use for reels' añadido por PR sm2#8076 (marca playlist-uses-reels).
    this.usesReels = page.locator(stable('playlist-uses-reels'));

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

  /** Escribe el nombre de la playlist (campo obligatorio). */
  async fillName(name) {
    await this.nameInput.fill(name);
  }

  /** Marca/desmarca el checkbox 'Use for reels' al estado deseado. */
  async setUsesReels(on) {
    await this.usesReels.setChecked(on);
  }

  /** Guarda el form. Tras crear con éxito, la ruta pasa a /playlist/<id>. */
  async saveForm() {
    await this.save.click();
  }
}

module.exports = { PlaylistPage };
