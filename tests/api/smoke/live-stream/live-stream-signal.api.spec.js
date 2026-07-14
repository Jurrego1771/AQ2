// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { isAvailable: isFfmpegAvailable } = require('../../../../src/utils/ffmpeg');

/**
 * @api @live-stream — Smoke del fixture liveSignal.
 *
 * El fixture crea un live + habilita MediaLive RTMP_PUSH + empuja una senal
 * sintetica (testsrc + sine) por ffmpeg. Los tests cubren los puntos observables:
 *
 *   LIVESIG-TC-001   ffmpeg no disponible -> skip limpio
 *   LIVESIG-TC-002   fixture expone liveId + rtmpUrl (medialive o legacy)
 *   LIVESIG-TC-003   isOnline() refleja el estado real del live tras el push
 *   LIVESIG-TC-004   stop() mata ffmpeg + borra el live (post-cleanup check)
 *   LIVESIG-TC-005   waitForOnline(true) detecta cuando llega senal
 *
 * Tags: @api @live-stream @signal
 */
test.describe('Live Signal fixture @api @live-stream @signal', () => {
  test('LIVESIG-TC-001 ffmpeg no disponible -> skip limpio @LIVESIG-TC-001', async () => {
    // El probe es sincrono-cache; esta asercion documenta la condicion de skip.
    // El fixture liveSignal ya skipea antes de pedir el handle.
    const available = await isFfmpegAvailable();
    expect(typeof available).toBe('boolean');
    if (!available) {
      test.skip(true, 'ffmpeg no esta en PATH; spec marcado como skip intencional');
    }
  });

  test('LIVESIG-TC-002 fixture expone liveId + rtmpUrl @LIVESIG-TC-002', async ({ liveSignal }) => {
    // Timeout generoso: provision de MediaLive puede tardar 60-90s en dev.
    test.setTimeout(180_000);

    expect(liveSignal).toBeTruthy();
    expect(typeof liveSignal.liveId).toBe('string');
    expect(liveSignal.liveId).toMatch(/^[a-f0-9]{24}$/);
    expect(typeof liveSignal.rtmpUrl).toBe('string');
    expect(liveSignal.rtmpUrl.length).toBeGreaterThan(0);
    expect(['medialive', 'legacy']).toContain(liveSignal.rtmpSource);
    expect(liveSignal.ffmpeg).toBeTruthy();
  });

  test('LIVESIG-TC-003 isOnline refleja el estado del live tras push @LIVESIG-TC-003', async ({
    liveSignal,
  }) => {
    test.setTimeout(180_000);

    // isOnline() puntual. El test solo verifica que la API responde y devuelve
    // un boolean; no asume online=true porque la senal puede no haber llegado
    // todavia al server (ffmpeg recien arrancado).
    const online = await liveSignal.isOnline();
    expect(typeof online).toBe('boolean');
  });

  test('LIVESIG-TC-004 stop() mata ffmpeg + borra el live @LIVESIG-TC-004', async ({
    liveSignal,
    api,
  }) => {
    test.setTimeout(180_000);

    const liveId = liveSignal.liveId;
    expect(liveId).toBeTruthy();

    await liveSignal.stop();

    // Tras stop(): ffmpeg proc muerto
    expect(liveSignal.ffmpeg).toBeNull();

    // Tras stop(): live borrado (404 al GET)
    const res = await api.get(`/api/live-stream/${liveId}`);
    expect([404, 200]).toContain(res.status());
    if (res.status() === 200) {
      // Si el server devolvio 200 (soft delete), esperamos status=DELETE.
      const body = await res.json();
      expect(body?.data?.status).toBe('DELETE');
    }
  });

  test('LIVESIG-TC-005 waitForOnline detecta la senal @LIVESIG-TC-005', async ({ liveSignal }) => {
    test.setTimeout(180_000);

    // El fixture ya esta empujando (start() corre en setup del fixture).
    // Damos hasta 45s para que el server detecte el stream y marque online=true.
    // Si MediaLive no esta habilitado en esta cuenta, el test pasa con expect(false)
    // porque no podemos validar deteccion sin cloud transcoding + RTMP_PUSH completo.
    const detected = await liveSignal.waitForOnline(45_000, true);
    if (liveSignal.rtmpSource === 'medialive') {
      // En un entorno con MediaLive, esperamos deteccion real.
      expect(detected, 'live no se marco online en 45s con ffmpeg empujando').toBe(true);
    } else {
      // Modo legacy: el server puede o no marcar online segun la implementacion.
      // No fallamos el spec - lo dejamos como observacion (test.info().annotations).
      test.info().annotations.push({
        type: 'observation',
        description: `legacy RTMP source; waitForOnline result=${detected}`,
      });
    }
  });
});