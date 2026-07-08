// @ts-check
const { z } = require('zod');
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');
const { showListItemSchema } = require('../../../src/schemas/show.schema');

/**
 * @api — Contrato HTTP del recurso Show (sm2 vista shows.coffee).
 *
 * ATENCION (verificado leyendo sm2/app.js linea 4094): en esta version de sm2
 * SOLO existe el endpoint /api/show/list (requiere MIDDLEWARE.USER + API_AUTH_READ
 * + MODULE_ACCESS('show', 'read')). POST /api/show, GET /api/show/:id, etc. NO estan
 * registrados publicamente - el handler de Show vive bajo /api/show/list y handlers
 * anidados /api/show/:show_id/season[/:season_id/episode[/:episode_id]].
 *
 * Para el alcance de PR1 cubrimos SOLO el endpoint publico observable:
 *   - GET /api/show/list        -> envelope {status:'OK', data:[...show]} (sm2 filtra campos sensibles)
 *   - GET /api/show/list?all=true -> incluye no-publish (sm2 default los oculta)
 *
 * POST/GET-by-id/DELETE quedan fuera de PR1; se cubren via UI smoke/regression
 * en tests/regression/show-* y tests/integration/show-seasons.*.
 */
test.describe('Show API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard');

  test('SHW-TC-LST GET /api/show/list devuelve items con shape minimo (id/title/type) @SHW-TC-LST', async ({ api }) => {
    // El handler sm2 hace un .select() que por defecto retorna SOLO _id/title/type.
    // El test verifica el shape contra showListItemSchema (no el showSchema completo)
    // porque esa es la realidad observable del endpoint hoy.
    const res = await api.get('/api/show/list', { params: { limit: 5 } });
    expect(res.status(), `GET /api/show/list fallo: ${await res.text()}`).toBe(200);

    const body = await res.json();
    const envelopeShape = z.object({
      status: z.string(),
      data: z.array(showListItemSchema),
    }).passthrough();
    const parsed = envelopeShape.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}\nbody:\n${JSON.stringify(body).slice(0, 500)}`
    ).toBe(true);
    expect(Array.isArray(parsed.data.data)).toBe(true);
  });

  test('SHW-TC-LST-ALL GET /api/show/list?all=true bypasea filtro de status @SHW-TC-LST-ALL', async ({ api }) => {
    // Por defecto el handler sm2 filtra status='OK'. ?all=true bypasea ese filtro.
    // Solo validamos el shape de envelope; no assertemos conteo de no-publish.
    const res = await api.get('/api/show/list', { params: { limit: 5, all: 'true' } });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const envelopeShape = z.object({
      status: z.string(),
      data: z.array(showListItemSchema),
    }).passthrough();
    const parsed = envelopeShape.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(Array.isArray(parsed.data.data)).toBe(true);
  });
});

