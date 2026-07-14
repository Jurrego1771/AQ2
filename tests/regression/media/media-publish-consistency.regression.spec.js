// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');

/**
 * Regresión — Consistencia del estado Published entre las 4 vistas de Media:
 * grid, lista, minimal list (listado /media) y el toggle Status del detalle
 * (/media/:id) @regression @media.
 *
 * Contexto: se reportó un media que se veía "Published" (ícono verde) en la
 * grilla del listado pero aparecía despublicado al abrir su detalle. Verificado
 * en vivo (dev, 2026-07-03): no se reprodujo la desincronización — publicar y
 * despublicar por el detalle se refleja de inmediato (carga fresca) e igual en
 * las 3 vistas del listado y al reabrir el detalle. Este spec protege ese
 * comportamiento contra una futura regresión.
 *
 * Self-contained: el fixture `transcodedMedia` crea un media real por ingesta
 * remota (con gate de transcoding) y lo borra al terminar.
 */
test.describe('Media — consistencia de estado Published @regression @media', () => {
  test('publicar y despublicar se refleja igual en grid, lista, minimal y detalle @MED-TC-021', async ({
    transcodedMedia,
    mediaPage,
    mediaDetailPage,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
    test.setTimeout(120_000);

    /** @param {'Published'|'Not Published'} label @param {boolean} checked */
    const assertConsistentAcrossViews = async (label, checked) => {
      await mediaPage.goto();
      for (const display of [
        mediaPage.displayGrid,
        mediaPage.displayList,
        mediaPage.displayMinimalList,
      ]) {
        await display.click();
        await expect
          .poll(() => mediaPage.publishLabel(transcodedMedia), { timeout: 10_000 })
          .toBe(label);
      }
      // Reabrir el detalle (navegación fresca): el síntoma original era
      // precisamente que el detalle mostrara un estado distinto al listado.
      await mediaDetailPage.goto(transcodedMedia);
      await expect
        .poll(() => mediaDetailPage.isPublishedOn(), { timeout: 10_000 })
        .toBe(checked);
    };

    // La cuenta tiene force_category_fill: sin categoría el save del toggle
    // Published se bloquea client-side (ver overview.md). Se asigna la primera
    // categoría disponible antes de tocar el estado.
    const catRes = await api.get('/api/category?full=true');
    const categoryId = (await catRes.json()).data?.[0]?._id;
    expect(categoryId, 'no hay categorías en la cuenta para el test').toBeTruthy();

    await mediaDetailPage.goto(transcodedMedia);
    await mediaDetailPage.setCategory(String(categoryId));

    // Un media recién ingestado nace despublicado (verificado en vivo).
    const initial = await (await api.get(`/api/media/${transcodedMedia}`)).json();
    expect(initial.data.is_published).toBe(false);

    // ---- Publicar ----
    await mediaDetailPage.togglePublished();
    const publishRes = await mediaDetailPage.save();
    expect(publishRes.ok(), `save respondió ${publishRes.status()}`).toBeTruthy();

    await expect
      .poll(
        async () => (await (await api.get(`/api/media/${transcodedMedia}`)).json()).data.is_published,
        { timeout: 15_000, intervals: [1000, 2000, 3000] }
      )
      .toBe(true);

    await assertConsistentAcrossViews('Published', true);

    // ---- Despublicar ----
    await mediaDetailPage.togglePublished();
    const unpublishRes = await mediaDetailPage.save();
    expect(unpublishRes.ok(), `save respondió ${unpublishRes.status()}`).toBeTruthy();

    await expect
      .poll(
        async () => (await (await api.get(`/api/media/${transcodedMedia}`)).json()).data.is_published,
        { timeout: 15_000, intervals: [1000, 2000, 3000] }
      )
      .toBe(false);

    await assertConsistentAcrossViews('Not Published', false);
  });
});
