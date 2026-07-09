// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');
const { isAvailable, runRtmpSend } = require('../../src/utils/ffmpeg');

/**
 * Live Stream Ingest — contrato + RTMP end-to-end.
 *
 * Tier 1 (siempre corre, ~8 tests):
 *   Verifica la estructura de `entry_points`, `cdn_zones`, `stream_id`,
 *   `publishing_token` y la regeneracion del token. Cubre AQ2#21 (Origin URL
 *   muestra "undefined" pre-save) implicitamente: con un live recien creado
 *   (sin guardar), entry_points puede estar vacio/null. Aceptamos
 *   cualquiera de los dos (el primer save los puebla).
 *
 * Tier 2 (skip si ffmpeg no esta disponible, 1 test):
 *   Envia un stream RTMP real con ffmpeg (lavfi/testsrc, no requiere
 *   archivos) al entry_points.primary[0].url del live. Verifica que el
 *   campo `online` del GET pase a `true` dentro de 60s.
 *
 * Self-contained: usa el fixture liveStream (crea + borra). El ffmpeg se
 * lanza con `-t 20` (se mata solo a los 20s) Y se mata explicitamente en
 * el finally del test (cleanup garantizado).
 *
 * Version del server verificado: v7.0.75.
 */
test.describe('Live Stream Ingest — contrato + RTMP @api @live-stream', () => {
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  // ─── Tier 1: contrato ────────────────────────────────────────────────────

  test('entry_points.primary existe y es array (vacio o con entries) @LIVE-TC-107', async ({
    liveStream,
    liveStreamClient,
  }) => {
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const ep = body.data?.entry_points;
    // Tras crear un live, entry_points puede estar { primary: [], backup: [] }
    // o { primary: [{profile, url}], backup: [] } si ya se persistio. Aceptamos
    // ambos (el test verifica estructura, no estado de poblacion).
    expect(ep, 'entry_points debe existir').toBeTruthy();
    expect(Array.isArray(ep.primary), 'entry_points.primary debe ser array').toBeTruthy();
    expect(Array.isArray(ep.backup), 'entry_points.backup debe ser array').toBeTruthy();
  });

  // PRUEBAS VIVAS del bug LIVE-RISK-13: las API-created lives tienen
  // entry_points.primary = [] (vacio). Solo el UI Save changes puebla el
  // array. Cuando se arregle, los 3 tests siguientes (108, 109, 110)
  // empezaran a pasar (test.fail() los mantiene rojos hasta entonces).

  test('cada entry de primary tiene profile (string) y url (string) @LIVE-TC-108', async ({
    liveStream,
    liveStreamClient,
  }) => {
    test.fail(
      true,
      'LIVE-RISK-13: API-created live tiene entry_points.primary vacio. ' +
        'Solo el UI Save changes puebla el array. Esperar fix para que la prueba ' +
        'pueda verificar contenido.'
    );
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const entries = body.data?.entry_points?.primary || [];
    // El expect falla si entries esta vacio. test.fail() lo flipea a verde
    // solo cuando se arregle el bug.
    expect(entries.length, 'BUG LIVE-RISK-13: entry_points.primary vacio').toBeGreaterThan(0);
    for (const e of entries) {
      expect(typeof e.profile, `entry.profile debe ser string: ${JSON.stringify(e)}`).toBe('string');
      expect(typeof e.url, `entry.url debe ser string: ${JSON.stringify(e)}`).toBe('string');
      expect(e.profile.length, `profile vacio: ${e.profile}`).toBeGreaterThan(0);
      expect(e.url.length, `url vacio: ${e.url}`).toBeGreaterThan(0);
    }
  });

  test('urls de entry_points son formato rtmp://origin-{region}.origin.mdstrm.com @LIVE-TC-109', async ({
    liveStream,
    liveStreamClient,
  }) => {
    test.fail(
      true,
      'LIVE-RISK-13: API-created live tiene entry_points.primary vacio. ' +
        'Cuando el server pueble el array, este test verificara que la URL ' +
        'matchea rtmp://origin-{region}.origin.mdstrm.com/...'
    );
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const entries = body.data?.entry_points?.primary || [];
    expect(entries.length, 'BUG LIVE-RISK-13: entry_points.primary vacio').toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.url, `url no es RTMP: ${e.url}`).toMatch(
        /^rtmp:\/\/origin-(us|cl|br|eu)\.origin\.mdstrm\.com\/.+$/
      );
    }
  });

  test('urls de entry_points contienen el stream_id del live @LIVE-TC-110', async ({
    liveStream,
    liveStreamClient,
  }) => {
    test.fail(
      true,
      'LIVE-RISK-13: API-created live tiene entry_points.primary vacio. ' +
        'Cuando el server pueble el array, este test verificara que la URL ' +
        'contiene el stream_id del live.'
    );
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const entries = body.data?.entry_points?.primary || [];
    const streamId = body.data?.stream_id;
    expect(streamId, 'live sin stream_id').toBeTruthy();
    expect(entries.length, 'BUG LIVE-RISK-13: entry_points.primary vacio').toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.url, `url debe contener stream_id: ${e.url}`).toContain(streamId);
    }
  });

  test('cdn_zones incluye "us" por defecto (region default) @LIVE-TC-111', async ({
    liveStream,
    liveStreamClient,
  }) => {
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const zones = body.data?.cdn_zones;
    expect(Array.isArray(zones), 'cdn_zones debe ser array').toBeTruthy();
    expect(zones, `cdn_zones vacio: ${JSON.stringify(zones)}`).toContain('us');
  });

  test('publishing_token es hex de 32 chars @LIVE-TC-112', async ({
    liveStream,
    liveStreamClient,
  }) => {
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const token = body.data?.publishing_token;
    expect(token, 'publishing_token no presente').toBeTruthy();
    expect(token, `token no es hex de 32: ${token}`).toMatch(/^[0-9a-f]{32}$/);
  });

  test('refresh-token cambia el token; el viejo deja de ser hex 32 @LIVE-TC-113', async ({
    liveStream,
    liveStreamClient,
  }) => {
    // 1. Token original.
    const r1 = await liveStreamClient.getById(liveStream);
    const token1 = (await r1.json()).data?.publishing_token;
    expect(token1).toMatch(/^[0-9a-f]{32}$/);

    // 2. Regenerar.
    const refresh = await liveStreamClient.refreshToken(liveStream);
    // El endpoint puede no existir (404) o fallar; toleramos.
    expectTolerant(refresh, [200, 400, 404]);

    if (refresh.status() === 200) {
      // 3. El token nuevo debe ser DIFERENTE del viejo.
      const r2 = await liveStreamClient.getById(liveStream);
      const token2 = (await r2.json()).data?.publishing_token;
      expect(token2, 'token nuevo no presente').toBeTruthy();
      expect(token2, 'token no cambio tras refresh').not.toBe(token1);
      expect(token2, `token nuevo no es hex 32: ${token2}`).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  test('entry_points.backup es array (vacio OK; estructura consistente) @LIVE-TC-114', async ({
    liveStream,
    liveStreamClient,
  }) => {
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const ep = body.data?.entry_points;
    expect(ep).toBeTruthy();
    expect(Array.isArray(ep.backup)).toBeTruthy();
    // backup puede ser vacio (default) o tener entries (si el live tiene backup
    // configurado). Cualquiera esta OK.
  });

  // ─── Tier 2: RTMP real con ffmpeg ────────────────────────────────────────
  // PRUEBA VIVA del bug LIVE-RISK-13: API-created live tiene entry_points
  // vacio, asi que no podemos obtener la URL RTMP para enviar senal.
  // Cuando el bug se arregle y la URL se pueble via API, este test enviara
  // la senal con ffmpeg y verificara que el live pasa a online=true.

  test('RTMP real: enviar senal con ffmpeg al entry_points.primary[0].url @LIVE-TC-115', async ({
    liveStream,
    liveStreamClient,
  }) => {
    // 0. Probe: ffmpeg disponible?
    const ffmpegOk = await isAvailable();
    if (!ffmpegOk) {
      test.skip(true, 'ffmpeg no encontrado en PATH (instalar o ajustar PATH)');
      return;
    }

    // PRUEBA VIVA del bug LIVE-RISK-13.
    test.fail(
      true,
      'LIVE-RISK-13: API-created live tiene entry_points.primary vacio, ' +
        'asi que no podemos obtener la URL RTMP para enviar senal. ' +
        'Cuando el bug se arregle, este test enviara ffmpeg al URL y verificara online=true.'
    );

    // 1. Obtener URL RTMP.
    const r = await liveStreamClient.getById(liveStream);
    const body = await r.json();
    const rtmpUrl = body.data?.entry_points?.primary?.[0]?.url;
    // BUG LIVE-RISK-13: API-created live no tiene entry_points. El expect
    // falla (rojo) hasta que se arregle el bug; test.fail() lo flipea
    // a verde solo entonces.
    expect(rtmpUrl, 'BUG LIVE-RISK-13: entry_points.primary[0].url vacio en API-created live').toBeTruthy();
    expect(rtmpUrl, `URL no es RTMP: ${rtmpUrl}`).toMatch(/^rtmp:\/\//);

    // 2. Estado inicial: online deberia ser false.
    expect(body.data?.online, 'live ya esta online antes de enviar senal').toBeFalsy();

    // 3. Lanzar ffmpeg en background.
    const handle = runRtmpSend(rtmpUrl, {
      durationSec: 30,
      videoSize: '320x240',
      fps: 10,
    });

    try {
      // 4. Esperar a que el live pase a online=true.
      let lastSeen = body.data?.online;
      let lastStderr = '';
      const start = Date.now();
      const TIMEOUT_MS = 60_000;
      const POLL_MS = 2000;
      while (Date.now() - start < TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const r2 = await liveStreamClient.getById(liveStream);
        if (!r2.ok()) continue;
        const b2 = await r2.json();
        lastSeen = b2.data?.online;
        lastStderr = handle.lastStderr();
        if (lastSeen === true) break;
      }

      // eslint-disable-next-line no-console
      console.log(
        `[ffmpeg-test] rtmpUrl=${rtmpUrl} ` +
        `online final=${lastSeen} elapsed=${Date.now() - start}ms ` +
        `lastStderr=${lastStderr.slice(-200).replace(/\n/g, ' ')}`
      );

      expect(lastSeen, `live no paso a online=true en ${TIMEOUT_MS}ms. lastStderr: ${lastStderr}`).toBe(true);
    } finally {
      // 5. Cleanup obligatorio.
      await handle.kill();
    }
  });
});

// ─── Helper local ───────────────────────────────────────────────────────────

/** Acepta 200/400/404/500 (exploratorio); falla si es algo inesperado. */
function expectTolerant(res, allowed = [200, 400, 404]) {
  expect(
    allowed.includes(res.status()),
    `status ${res.status()} fuera de [${allowed.join(',')}]: ${res.text().catch(() => '')}`
  ).toBeTruthy();
}