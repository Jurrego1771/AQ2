// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');
const { sm } = require('../../../src/utils/selectors');
const { loginAsSecondUser } = require('../../../src/api/second-session');
const { createTranscodedMedia } = require('../../../src/api/media-factory');
const { ResourceCleaner } = require('../../../src/fixtures/resource-cleaner');

// Mismo default que src/fixtures/index.js (transcodedMedia): video público
// corto y liviano para ingesta remota.
const SAMPLE_VIDEO_URL =
  process.env.QA_SAMPLE_VIDEO_URL || 'https://cdn.pixabay.com/video/2022/10/01/133165-755982945_tiny.mp4';

/**
 * Regresión — Alerta "editado por otro usuario" en Live Stream y Media
 * (sm2#8317) @regression.
 *
 * El servidor publica un evento websocket `/{recurso}/:id/changed` tras cada
 * guardado exitoso; el cliente de otras sesiones (con la página ya abierta)
 * muestra un banner de warning si el guardado no fue el suyo. Verificado en
 * vivo con dos sesiones reales (ver knowledge-core): funciona en live-stream
 * y media. Este spec lo protege contra regresión.
 *
 * Diseño: la sesión que EDITA no necesita un browser real -el servidor solo
 * mira la sesión del request, no si vino de un form o de la API- así que se
 * usa un segundo APIRequestContext autenticado en paralelo (más rápido y
 * estable que un segundo browser real, que además comparte cookies con
 * cualquier otra pestaña del mismo browser). Solo la sesión que OBSERVA
 * (`page`, fixture de sesión principal) necesita ser un browser real, porque
 * el banner se recibe por websocket y se renderiza ahí.
 */
test.describe('Alerta de edición concurrente ("changed by another user") @regression', () => {
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
    test.skip(
      !env.user2 || !env.pass2,
      'TEST_USER2_<ENV>/TEST_PASS2_<ENV> no configurados en .env (ver .env.example)'
    );
  });

  test('guardar un live-stream desde otra sesión muestra el banner de aviso @LIVE-TC-15', async ({
    page,
    api,
    liveStream,
    playwright,
  }) => {
    // El id de `liveStream` ya está creado y se auto-limpia (fixture).
    await page.goto(`/live-stream/${liveStream}`);
    await expect(page.locator(sm('save'))).toBeVisible();
    const alert = page.locator(sm('global-alert'));
    await expect(alert).not.toBeVisible(); // baseline: sin alerta al cargar

    // Segunda sesión real, independiente, guarda el MISMO recurso.
    const other = await loginAsSecondUser(playwright, {
      baseURL: env.baseURL,
      user: env.user2,
      pass: env.pass2,
    });
    const current = await (await other.get(`/api/live-stream/${liveStream}`)).json();
    const saveRes = await other.post(`/api/live-stream/${liveStream}`, {
      form: { name: current.data.name },
    });
    expect(saveRes.ok(), `save del segundo usuario respondió ${saveRes.status()}`).toBeTruthy();
    await other.dispose();

    // La página ya abierta (sin recargar) debe mostrar el aviso.
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText('updated by another user');
  });

  test('guardar un media desde otra sesión muestra el banner de aviso @MED-TC-024', async ({
    page,
    api,
    playwright,
  }) => {
    test.setTimeout(60_000);
    const cleaner = new ResourceCleaner(api);
    // waitTranscoding:false -> el banner no depende del estado de transcoding,
    // no hace falta esperar el gate completo (más rápido).
    const id = await createTranscodedMedia(api, {
      fileUrl: SAMPLE_VIDEO_URL,
      fileName: `[QA-AUTO] Alert probe ${Date.now()}`,
      waitTranscoding: false,
    });
    cleaner.register('media', id);

    try {
      await page.goto(`/media/${id}`);
      await expect(page.locator(sm('save'))).toBeVisible();
      const alert = page.locator(sm('global-alert'));
      await expect(alert).not.toBeVisible(); // baseline

      const other = await loginAsSecondUser(playwright, {
        baseURL: env.baseURL,
        user: env.user2,
        pass: env.pass2,
      });
      const current = await (await other.get(`/api/media/${id}`)).json();
      const saveRes = await other.post(`/api/media/${id}`, { form: { title: current.data.title } });
      expect(saveRes.ok(), `save del segundo usuario respondió ${saveRes.status()}`).toBeTruthy();
      await other.dispose();

      await expect(alert).toBeVisible({ timeout: 10_000 });
      await expect(alert).toContainText('updated by another user');
    } finally {
      await cleaner.clean();
    }
  });
});
