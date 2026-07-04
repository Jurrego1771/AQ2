// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * Regresión — Selector de Show en el detalle de Media no debe listar shows
 * borrados @regression @media.
 *
 * Contexto: reporte de cliente — al asignar un Show a un media, un mismo show
 * (ej. "Capital, la Bolsa y la Vida") aparecía listado varias veces. Causa raíz
 * (sm2 PR mediastream/sm2#8443, issue #8442): el picker de Show en Media hacía
 * GET /api/show/list?all=true, que el server interpreta como "incluir shows
 * con cualquier status" (incluye DELETE); si un show borrado comparte título
 * con uno activo (o hay varios borrados con el mismo título — común tras runs
 * de datos de prueba), aparecen como entradas duplicadas en el dropdown.
 * El fix quita `?all=true` del lado cliente cuando el picker es para media.
 *
 * Verificado en vivo (dev, 2026-07-03): el fix ya está desplegado — el request
 * real ya no lleva `all=true` y el <select> no incluye ninguno de los shows
 * borrados existentes en el entorno (hay 5896 shows status=DELETE en dev,
 * varios con títulos duplicados, ej. "Prueba Show api" x5). Estos specs
 * protegen ese comportamiento contra una futura regresión.
 */
test.describe('Media — selector de Show excluye shows borrados @regression @media', () => {
  test('GET /api/show/list filtra por status: sin all=true solo OK, con all=true incluye DELETE @MED-TC-022', async ({
    api,
  }) => {
    const [withoutAllRes, withAllRes] = await Promise.all([
      api.get('/api/show/list?fields=status'),
      api.get('/api/show/list?all=true&fields=status'),
    ]);
    expect(withoutAllRes.ok(), `sin all=true respondió ${withoutAllRes.status()}`).toBeTruthy();
    expect(withAllRes.ok(), `con all=true respondió ${withAllRes.status()}`).toBeTruthy();

    const withoutAll = (await withoutAllRes.json()).data;
    const withAll = (await withAllRes.json()).data;

    expect(withoutAll.length, 'no hay shows en la cuenta para el test').toBeGreaterThan(0);
    const statusesWithoutAll = new Set(withoutAll.map((/** @type {any} */ s) => s.status));
    expect([...statusesWithoutAll]).toEqual(['OK']);

    // Confirma que la comparación es significativa: si el entorno no tuviera
    // shows borrados, la aserción de arriba pasaría igual sin ejercitar el filtro.
    const deletedInAll = withAll.filter((/** @type {any} */ s) => s.status === 'DELETE');
    expect(
      deletedInAll.length,
      'el entorno no tiene shows status=DELETE: el test no puede confirmar el filtro'
    ).toBeGreaterThan(0);
  });

  test('el selector de Show del detalle no incluye shows borrados @MED-TC-023', async ({
    mediaPage,
    mediaDetailPage,
    api,
  }) => {
    // Deriva del entorno los títulos que SOLO existen como shows borrados (sin
    // ninguna contraparte activa) — no se hardcodea un título específico.
    const allShowsRes = await api.get('/api/show/list?all=true&fields=status');
    const allShows = (await allShowsRes.json()).data;
    /** @type {Map<string, Set<string>>} */
    const statusesByTitle = new Map();
    for (const s of allShows) {
      if (!statusesByTitle.has(s.title)) statusesByTitle.set(s.title, new Set());
      statusesByTitle.get(s.title)?.add(s.status);
    }
    const deletedOnlyTitles = [...statusesByTitle]
      .filter(([, statuses]) => statuses.size === 1 && statuses.has('DELETE'))
      .map(([title]) => title);
    expect(
      deletedOnlyTitles.length,
      'no hay shows borrados exclusivos en el entorno para probar'
    ).toBeGreaterThan(0);

    await mediaPage.goto();
    const id = await mediaPage.firstMediaId();
    expect(id, 'no se pudo derivar un media del listado').toBeTruthy();

    const [showListRequest] = await Promise.all([
      mediaDetailPage.page.waitForRequest((r) => /\/api\/show\/list/.test(r.url())),
      mediaDetailPage.goto(String(id)),
    ]);
    // Defensa directa contra la causa raíz: el request no debe llevar all=true.
    expect(showListRequest.url()).not.toContain('all=true');

    await mediaDetailPage.showSelect.waitFor({ state: 'attached', timeout: 10_000 });
    const optionTexts = await mediaDetailPage.showSelect.locator('option').allTextContents();
    const leaked = deletedOnlyTitles.filter((title) => optionTexts.includes(title));
    expect(leaked, `shows borrados presentes en el selector: ${leaked.join(', ')}`).toEqual([]);
  });
});
