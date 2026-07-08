// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * Regresión UI — Schedule / Song Metadata (@regression @live-stream).
 *
 * Valida el PR mediastream/sm2#8463: el bloque de song metadata del form de
 * schedule (Inherit Ignore Song Metadata / Ignore Song Metadata) solo se
 * renderiza cuando el Live padre es de tipo AUDIO; en video no existe.
 *
 * Complementa la cobertura de API (LIVE-TC-16/17): aquí se verifica el
 * renderizado condicional y la persistencia END-TO-END por la UI (togglear +
 * guardar + recargar), incluyendo el vaciado (uncheck -> false) por la regla de
 * higiene de forms (add/modify/clear; ver memoria form-tests-add-modify-clear).
 *
 * Self-contained: cada test crea su live (fixture) + un schedule por API y los
 * limpia al terminar (el DELETE del live borra sus schedules en cascada).
 */
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const onetime = (name, d, sh, eh) => ({
  name,
  type: 'onetime',
  date_start: d,
  date_end: d,
  date_start_hour: sh,
  date_start_minute: 0,
  date_end_hour: eh,
  date_end_minute: 0,
  tz_offset: 0,
  for_recording: false,
});

test.describe('Schedule UI — song metadata solo en audio @regression @live-stream', () => {
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  test('audio: el schedule muestra los 2 controles de song metadata @LIVE-TC-18', async ({
    schedulePage,
    liveStreamClient,
    audioLiveStream,
  }) => {
    const created = await liveStreamClient.createScheduleJob(
      audioLiveStream,
      onetime('QA songmeta ui audio', day(20), 10, 12)
    );
    const sid = (await created.json()).data._id;

    await schedulePage.goto(audioLiveStream, sid);
    await expect(schedulePage.title).toBeVisible();
    await expect(schedulePage.songInherit).toBeVisible();
    await expect(schedulePage.songIgnore).toBeVisible();
  });

  test('video: el schedule NO muestra los controles de song metadata @LIVE-TC-19', async ({
    schedulePage,
    liveStreamClient,
    liveStream,
  }) => {
    const created = await liveStreamClient.createScheduleJob(
      liveStream,
      onetime('QA songmeta ui video', day(21), 10, 12)
    );
    const sid = (await created.json()).data._id;

    await schedulePage.goto(liveStream, sid);
    await expect(schedulePage.title).toBeVisible();
    // El bloque no existe en el DOM para lives de video (if @is_audio en la vista).
    await expect
      .poll(() => schedulePage.songMetadataControlCount(), { timeout: 10_000 })
      .toBe(0);
  });

  test('audio: togglear song metadata por UI, guardar y recargar persiste (incl. uncheck) @LIVE-TC-20', async ({
    schedulePage,
    liveStreamClient,
    audioLiveStream,
    page,
  }) => {
    // baseline conocido: inherit=true, ignore=false
    const name = 'QA songmeta ui persist';
    const created = await liveStreamClient.createScheduleJob(audioLiveStream, {
      ...onetime(name, day(22), 10, 12),
      inherit_ignore_song_metadata: true,
      ignoreSongMetadata: false,
    });
    const sid = (await created.json()).data._id;

    await schedulePage.goto(audioLiveStream, sid);
    // Esperar a que el XHR del schedule ASIENTE el form (el título carga su valor)
    // antes de togglear; si no, el load async re-marca el checkbox tras el uncheck.
    await expect(schedulePage.title).toHaveValue(name);
    await expect(schedulePage.songInherit).toBeVisible();

    // modify + clear: apagar inherit (uncheck -> false) y encender ignore.
    await schedulePage.songInherit.uncheck();
    await schedulePage.songIgnore.check();

    const saved = page.waitForResponse(
      (r) => /\/schedule-job\//.test(r.url()) && r.request().method() === 'POST' && r.ok()
    );
    await schedulePage.save.click();
    await saved;

    // recargar y confirmar que el nuevo estado (incl. el false) persiste.
    await schedulePage.goto(audioLiveStream, sid);
    // Mismo asentamiento tras el reload: el checkbox arranca en su default y el
    // XHR aplica el valor persistido después -> esperar el título y poll del estado.
    await expect(schedulePage.title).toHaveValue(name);
    await expect
      .poll(() => schedulePage.songInherit.isChecked(), { timeout: 10_000 })
      .toBe(false); // inherit apagado (false) debe persistir
    expect(await schedulePage.songIgnore.isChecked(), 'ignore encendido debe persistir').toBe(true);
  });
});
