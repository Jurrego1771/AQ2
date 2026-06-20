// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * Regresión — Detalle/Edición de Media: Basic Information (@regression @media).
 * Comportamiento validado en vivo contra dev.platform.mediastre.am.
 *
 * Self-contained: el fixture `transcodedMedia` crea un media real por ingesta
 * remota (con gate de transcoding) y lo borra al terminar. No depende de data
 * preexistente.
 */
test.describe('Media detail — Basic Information @regression @media', () => {
  test('abrir un media muestra el form de Basic Information @MED-TC-012', async ({
    mediaPage,
    mediaDetailPage,
  }) => {
    await mediaPage.goto();
    const id = await mediaPage.firstMediaId();
    expect(id, 'no se pudo derivar un media del listado').toBeTruthy();

    await mediaDetailPage.goto(String(id));
    await expect(mediaDetailPage.titleInput).toBeVisible();
    await expect(mediaDetailPage.descriptionInput).toBeVisible();
    await expect(mediaDetailPage.saveButton).toBeVisible();
  });

  test('editar la descripción y guardar persiste (verificado por API) @MED-TC-013', async ({
    transcodedMedia,
    mediaDetailPage,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
    // El fixture crea media + espera transcoding (puede tardar); timeout amplio.
    test.setTimeout(180_000);

    const marker = `QA-EDIT ${Date.now()}`;

    // La cuenta tiene force_category_fill: sin categoría el save se bloquea
    // (ver #12/categoría). Se asigna la primera categoría disponible antes de editar.
    const catRes = await api.get('/api/category?full=true');
    const categoryId = (await catRes.json()).data?.[0]?._id;
    expect(categoryId, 'no hay categorías en la cuenta para el test').toBeTruthy();

    await mediaDetailPage.goto(transcodedMedia);
    // Descripción primero: su espera de estabilidad agota la hidratación async.
    // Luego la categoría (force_category_fill), ya sin riesgo de que un GET la borre.
    await mediaDetailPage.setDescription(marker);
    await mediaDetailPage.setCategory(String(categoryId));
    const response = await mediaDetailPage.save();

    // El save debe responder OK (no 404 INVALID_SHOW_NOT_FOUND, ver #12).
    expect(response.ok(), `save respondió ${response.status()}`).toBeTruthy();

    // Verificar persistencia por API (fuente de verdad): evita la carrera de
    // hidratación al releer el field en UI (que arranca vacío tras recargar).
    await expect
      .poll(
        async () => {
          const res = await api.get(`/api/media/${transcodedMedia}`);
          return (await res.json()).data?.description;
        },
        { timeout: 15_000, intervals: [1000, 2000, 3000] }
      )
      .toBe(marker);
  });
});
