// @ts-check
const { sm } = require('../utils/selectors');

/**
 * Page Object del form de Schedule de un Live Stream
 * (vista schedule.coffee, ruta /live-stream/:liveId/schedule/:scheduleId).
 *
 * REGLA sm:: se usa sm() donde la marca existe (scheduleTitle, save, delete,
 * global-alert). El bloque de **song metadata** del PR sm2#8463 NO expone marca
 * sm: (usa data-name), consistente con el gap ya conocido del form de schedule
 * (AQ2#24). Se localiza por data-name como excepción documentada.
 *
 * El bloque solo se renderiza cuando el Live padre es de tipo AUDIO (sm2#8463):
 * en video, estos controles no existen en el DOM.
 */
class SchedulePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    this.title = page.locator(sm('scheduleTitle'));
    this.save = page.locator(sm('save'));
    this.globalAlert = page.locator(sm('global-alert'));

    // Song metadata (solo audio; sin marca sm:, ver AQ2#24 / sm2#8463).
    this.songInherit = page.locator('[data-name="schedule-inherit-ignore-song-metadata"]');
    this.songIgnore = page.locator('[data-name="schedule-ignore-song-metadata-check"]');
  }

  /** Abre el detalle/edición de un schedule concreto. */
  async goto(liveId, scheduleId) {
    await this.page.goto(`/live-stream/${liveId}/schedule/${scheduleId}`);
  }

  /** Cuenta de controles song-metadata presentes en el DOM (0 en video, 2 en audio). */
  async songMetadataControlCount() {
    return (await this.songInherit.count()) + (await this.songIgnore.count());
  }
}

module.exports = { SchedulePage };
