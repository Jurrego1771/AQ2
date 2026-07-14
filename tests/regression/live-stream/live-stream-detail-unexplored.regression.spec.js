// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * Regresión — Live Stream: secciones inexploradas del detalle (sesión QA 2026-07-09).
 *
 * Verde: comportamiento correcto protegido (anti-regresión).
 * test.fail() inside (convención del proyecto, ver media-list.regression.spec.js):
 *   pruebas VIVAS de bugs/issues abiertos en Jurrego1771/AQ2.
 *
 * Las secciones AI Live Transcription, Playout y Next Settings NO exponen marcas
 * sm: en sus controles; sus pruebas permanecen en rojo-esperado hasta que el
 * front agregue los selectores (issues Jurrego1771/AQ2#52/#53/#54).
 */
test.describe('Live Stream detail — secciones inexploradas @regression @live-stream', () => {
  test.beforeEach(async ({ liveStream }) => {
    // fixture `liveStream` crea uno por API y lo borra al terminar.
    expect(liveStream).toMatch(/^[0-9a-f]{24}$/);
  });

  // ---- VERDES (anti-regresion) ----

  test('detalle renderiza un set robusto de secciones con sm: cosechadas en vivo @LIVE-TC-116', async ({
    page,
    liveStreamDetailPage,
    liveStream,
  }) => {
    await liveStreamDetailPage.gotoDetail(liveStream);

    // Unico poll robusto: contamos TODAS las marcas sm: del detalle. Cosechado
    // 2026-07-09 dev v7.0.75 -> 207 nodos / 180 marcas unicas. Fijamos un suelo
    // saludable (>=120) que protege cualquier regresion grave sin ser fragil.
    const expectedUniqueSm = 120;
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const seen = new Set();
            for (const e of document.querySelectorAll('[sm]')) {
              const m = e.getAttribute('sm');
              if (m) seen.add(m);
            }
            return seen.size;
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(expectedUniqueSm);
  });

  // LIVE-TC-117 (Start Recording arranca disabled) eliminado 2026-07-14:
  // timeout bajo carga (gotoDetail 10s + poll 15s > 30s) y estado transitorio
  // del boton durante la carga. Pasa aislado (9.1s); no es bug de producto.
  // Se rehara bien (esperar estado estable del detalle). Definicion en
  // knowledge-core (estado: deferred).

  test('EPG y PlayAnywhere exponen N controles con sm: consistentes con el detalle @LIVE-TC-118', async ({
    liveStreamDetailPage,
    liveStream,
  }) => {
    await liveStreamDetailPage.gotoDetail(liveStream);

    const epgOptions = await liveStreamDetailPage.epgSelect.locator('option').count();
    expect(epgOptions).toBeGreaterThanOrEqual(1);

    await expect.poll(() => liveStreamDetailPage.syncEpg.isVisible(), { timeout: 10_000 }).toBe(true);
    expect(await liveStreamDetailPage.syncEpg.isDisabled()).toBe(false);

    const paCounts = await Promise.all([
      liveStreamDetailPage.switchPlayanywhere.count(),
      liveStreamDetailPage.playanywhereProjectId.count(),
      liveStreamDetailPage.playanywhereProgramId.count(),
      liveStreamDetailPage.switchPlayanywhereAlwaysVisible.count(),
    ]);
    expect(paCounts).toEqual([1, 1, 1, 1]);

    await expect
      .poll(() => liveStreamDetailPage.distributionPolicy.isVisible(), { timeout: 10_000 })
      .toBe(true);
    expect(await liveStreamDetailPage.distributionPolicy.inputValue()).toBe('');

    await expect.poll(() => liveStreamDetailPage.itgChannel.isVisible(), { timeout: 10_000 }).toBe(true);
    expect(await liveStreamDetailPage.itgChannel.inputValue()).toBe('');
  });

  // ---- VIVOS (pruebas de issues abiertos) ----

  test('consola limpia al cargar /live-stream/:id [prueba viva BUG #50] @LIVE-TC-119', async ({
    liveStreamDetailPage,
    liveStream,
  }) => {
    test.fail(
      true,
      'AQ2#50 — TypeError en consola del detalle (live_dynamic_preview.js); verde al corregir',
    );

    const consoleErrors = [];
    const onError = (msg) => {
      // Capturar mensaje + location URL para poder filtrar por origen conocido.
      consoleErrors.push({
        text: msg.text(),
        url: msg.location()?.url || '',
      });
    };
    const onPageError = (err) => consoleErrors.push({ text: err.message, url: '' });

    liveStreamDetailPage.page.on('console', onError);
    liveStreamDetailPage.page.on('pageerror', onPageError);

    await liveStreamDetailPage.gotoDetail(liveStream);
    await liveStreamDetailPage.basicInformation.waitFor({ state: 'visible' });
    await liveStreamDetailPage.page.waitForTimeout(2_000);

    liveStreamDetailPage.page.off('console', onError);
    liveStreamDetailPage.page.off('pageerror', onPageError);

    // Filtramos ruido conocido (no son bugs del modulo en si):
    // - intercom.io 403 (terceros)
    // - /api/onboarding/contact 401 (botqa no onboarded)
    // - background-player.{jpg,png,webp} 403 (live sin background image)
    // - /api/media/dummy 404 (preview de thumbs sin cargar)
    // - /records 404 (issue #51 separado; no lo bloqueamos aca)
    const filtered = consoleErrors.filter(
      (e) =>
        !/intercom/i.test(e.text) &&
        !/onboarding\/contact/.test(e.text) &&
        !/background\/[^?]+(?:\.jpg|\.jpeg|\.png|\.webp)/i.test(e.text) &&
        !/\/api\/media\/dummy/.test(e.text) &&
        !/\/records/.test(e.text),
    );
    expect(
      filtered.length,
      `Errores no filtrados: ${JSON.stringify(filtered)}`,
    ).toBe(0);
  });

  test('GET /api/live-stream/:id/records NO devuelve 404 [prueba viva BUG #51] @LIVE-TC-120', async ({
    api,
    liveStream,
  }) => {
    test.fail(
      true,
      'AQ2#51 — /records devuelve 404 en cada carga del detalle; verde al corregir',
    );

    const r = await api.get(`/api/live-stream/${liveStream}/records`);
    expect(
      r.status(),
      'endpoint /records debe responder 2xx o 4xx conocido, no 404 silencioso',
    ).not.toBe(404);
  });

  test('AI Live Transcription expone controles con marca sm: [prueba viva TECH-DEBT #52] @LIVE-TC-121', async ({
    page,
    liveStreamDetailPage,
    liveStream,
  }) => {
    test.fail(
      true,
      'AQ2#52 — AI Live Transcription sin marcas sm:; verde cuando front agregue los selectores',
    );

    await liveStreamDetailPage.gotoDetail(liveStream);
    const count = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h3')).find((el) =>
        /AI Live Transcription/.test(el.textContent || ''),
      );
      if (!h) return -1;
      const wrap = h.parentElement;
      return wrap ? wrap.querySelectorAll('[sm]').length : -2;
    });
    expect(count, 'AI Live Transcription debe tener al menos un nodo con sm:').toBeGreaterThan(0);
    // silencio lint
    void liveStreamDetailPage;
  });

  test('Playout expone controles con marca sm: [prueba viva TECH-DEBT #53] @LIVE-TC-122', async ({
    page,
    liveStreamDetailPage,
    liveStream,
  }) => {
    test.fail(
      true,
      'AQ2#53 — Playout sin marcas sm:; verde cuando front agregue los selectores',
    );

    await liveStreamDetailPage.gotoDetail(liveStream);
    const count = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h3')).find(
        (el) => (el.textContent || '').trim() === 'Playout',
      );
      if (!h) return -1;
      const wrap = h.parentElement;
      return wrap ? wrap.querySelectorAll('[sm]').length : -2;
    });
    expect(count, 'Playout debe tener al menos un nodo con sm:').toBeGreaterThan(0);
  });

  test('Next Settings expone controles con marca sm: [prueba viva TECH-DEBT #54] @LIVE-TC-123', async ({
    page,
    liveStreamDetailPage,
    liveStream,
  }) => {
    test.fail(
      true,
      'AQ2#54 — Next Settings sin marcas sm:; verde cuando front agregue los selectores',
    );

    await liveStreamDetailPage.gotoDetail(liveStream);
    const count = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h3')).find(
        (el) => (el.textContent || '').trim() === 'Next Settings',
      );
      if (!h) return -1;
      const wrap = h.parentElement;
      return wrap ? wrap.querySelectorAll('[sm]').length : -2;
    });
    expect(count, 'Next Settings debe tener al menos un nodo con sm:').toBeGreaterThan(0);
  });
});
