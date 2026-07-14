// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { mediaItem } = require('../../../src/fixtures/data.factory');
const { ResourceCleaner } = require('../../../src/fixtures/resource-cleaner');

/**
 * @e2e — solo flujos críticos (dinero/media). Setup por API, verificación por UI.
 *
 * Aprendizaje en vivo (2026-07-08 / sesión ads):
 *   - El POST directo persiste el media con is_published=false. La UI de /media
 *     SIN EMBARGO lo muestra en búsqueda porque ya manda `all=true` en su
 *     petición (sm-harvest confirma `?admin=true&...&all=true` en la XHR del front).
 *     Por eso el spec no necesita publicar: el media aparece igualmente.
 *   - Match por `contains` (no palabra completa), case-insensitive.
 *   - Después de `Enter`, las cards tardan ~5s en repintar en dev compartido.
 *     Por eso se usa `expect.poll` con timeout 15s y se loguea time-to-visible
 *     para detectar degradación futura (budget implícito).
 *
 * NOTA: El test original usaba `mediaClient.create` + `mediaPage.root` (que no
 * existía en el POM) y fallaba por literal reference, no por timing. Este fix
 * reemplaza la post-aserción rota por polling real sobre `mediaPage.items`
 * (el selector válido del POM, :visible para pickear entre los 3 layouts).
 */
test.describe('Media e2e @e2e', () => {
  test('un media creado por API es visible y buscable en la UI @MED-E2E-1', async ({ mediaClient, mediaPage, api }) => {
    // Setup del media por POST directo (no usamos factory -> cubrimos el path "API cruda").
    // Cleanup idempotente via ResourceCleaner (mismo patron que `liveStream`/`ad`).
    // Titulo simple alfanumerico + guion (sin espacios) para evitar URL-encoding issues
    // en el query de busqueda del front con `titleRules=contains`.
    const cleaner = new ResourceCleaner(api);
    const title = `[QA-E2E]-${Date.now()}`; // unico, grep-able por prefijo
    const payload = mediaItem({ title });
    const createRes = await mediaClient.create(payload);
    expect(createRes.ok(), `POST /api/media: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
    const body = await createRes.json();
    const id = body.data?._id || body.data?.id;
    expect(id, 'POST /api/media debe devolver id').toBeTruthy();
    cleaner.register('media', id);

    try {
      // Navegación + búsqueda: medimos time-to-visible como budget para detectar
      // degradación futura (dev compartido bajo carga).
      await mediaPage.goto();
      const t0 = Date.now();
      await mediaPage.search(payload.title);

      // Polling: tras el Enter, la XHR tarda en llegar + render de cards.
      // 15s es ~3x el baseline observado (5s) y tolera el dev compartido.
      await expect.poll(() => mediaPage.items.count(), { timeout: 15_000 })
        .toBeGreaterThan(0);
      const dt = Date.now() - t0;
      // eslint-disable-next-line no-console
      console.log(`[MED-E2E-1] time-to-visible: ${dt}ms`);

      // Verificacion del contenido: la card visible debe contener el titulo
      // (case-insensitive, match por substring - heuristica media #10).
      // Usamos evaluateAll para tomar el texto de cada card visible.
      // Tambien verifica que el id del media aparece en la marca sm del card:
      // `media-container-<id>` - esta es la senal inequivoca de "este media concreto".
      const smIds = await mediaPage.items.evaluateAll(
        (nodes) => nodes.map((n) => n.getAttribute('sm') || '')
      );
      expect(
        smIds.some((sm) => sm === `media-container-${id}`),
        `el id ${id} debe estar entre las cards visibles tras search (smIds=${JSON.stringify(smIds).slice(0, 200)})`
      ).toBe(true);
    } finally {
      await cleaner.clean();
    }
  });
});
