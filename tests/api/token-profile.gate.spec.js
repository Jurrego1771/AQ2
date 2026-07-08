// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * @api — Gate del flow AragonTV (PR sm2#8451, Jurrego1771/AQ2): token con
 * TokenProfile que incluye 'media.category' puede llamar GET /api/category.
 *
 * PRUEBAS-VIVA que dependen de credenciales admin no provistas en el harness
 * actual del bot QA. Se SKIPEAN con mensaje claro cuando:
 *   - env.tokenProfileIdWithCategory / env.tokenProfileIdWithoutCategory == '' (default)
 *
 * Cuando se configuren (tester humano crea los TokenProfile + emite tokens
 * persistentes via una sesion admin y los pone en .env), estos specs validan
 * end-to-end:
 *   - TOK-TC-001: GET /api/category responde 200 con token CON 'media.category'
 *   - TOK-TC-002: GET /api/category responde 403 con token SIN 'media.category'
 *   - TOK-TC-003: GET /api/category/:id con token restringido (status minguied)
 *   - TOK-TC-004: tokens sin x-api-token ni bearer -> 401/403 sin auth
 *
 * Setup necesario (ver TOK-RISK-001 en knowledge-core/modules/token-profiles/riesgos.yaml):
 *   1. Login admin en el dashboard, ir a Settings > Token Profiles, crear 2 perfiles:
 *      - "QA-CONTRACT-with-category"    con modules: [..., 'media.category', ...]
 *      - "QA-CONTRACT-without-category" con modules: [..., 'media.category'-FALTA, ...]
 *   2. Generar 1 access token por perfil (admin hace click en "Generate Token"),
 *      persistir ambos en .env:
 *      - TOKEN_PROFILE_ID_WITH_CATEGORY_DEV=<hex>
 *      - TOKEN_PROFILE_ID_WITHOUT_CATEGORY_DEV=<hex>
 *   3. Marcar la cuenta con el modulo `api_tokens` habilitado (lo hace admin)
 *   4. Re-run este spec -> verde
 *
 * Hasta entonces, este spec deja un placeholder visible y no falla la suite.
 */

const skipReason =
  !env.tokenProfileIdWithCategory || !env.tokenProfileIdWithoutCategory
    ? 'TOK-SKIP: TOKEN_PROFILE_ID_WITH_CATEGORY_* / TOKEN_PROFILE_ID_WITHOUT_CATEGORY_* no configurados en .env (ver TOK-RISK-001); tests gateados.'
    : null;

const authHeadersFor = (id) => ({
  // Token API = X-API-Token header con el hex del TokenProfile.
  // Si tu setup usa Bearer, ajustalo aca.
  'x-api-token': id,
});

test.describe('Token Profile Gate (AragonTV flow) @api', () => {
  test.skip(!!skipReason || env.isProd, skipReason || 'prodGuard');

  test('TOK-TC-001 GET /api/category con token CON media.category responde 200 @TOK-TC-001', async () => {
    const res = await fetch(`${env.baseURL}/api/category`, {
      headers: authHeadersFor(env.tokenProfileIdWithCategory),
    });
    expect(res.status, `CON media.category esperamos 200`).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('TOK-TC-002 GET /api/category con token SIN media.category responde 403 @TOK-TC-002', async () => {
    const res = await fetch(`${env.baseURL}/api/category`, {
      headers: authHeadersFor(env.tokenProfileIdWithoutCategory),
    });
    expect(res.status, `SIN media.category esperamos 403`).toBe(403);
  });

  test('TOK-TC-003 GET /api/category/:id con token restringido respeta el modulo @TOK-TC-003', async () => {
    // Setup: tomar un id real del listado CON media.category (estamos autorizados).
    const listRes = await fetch(`${env.baseURL}/api/category`, {
      headers: authHeadersFor(env.tokenProfileIdWithCategory),
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    const id = list?.data?.[0]?._id;
    test.skip(!id, 'TOK-SKIP: no hay categoria accesible para detail con profile WITH-category');

    // Mismo id con el token SIN media.category debe denegar.
    const detailRes = await fetch(`${env.baseURL}/api/category/${id}`, {
      headers: authHeadersFor(env.tokenProfileIdWithoutCategory),
    });
    expect(detailRes.status, `GET /api/category/:id sin media.category esperamos 403`).toBe(403);

    // Con profile CON debe pasar (estricto: 200 o 404 si el id fue borrado).
    const detailOK = await fetch(`${env.baseURL}/api/category/${id}`, {
      headers: authHeadersFor(env.tokenProfileIdWithCategory),
    });
    expect([200, 404]).toContain(detailOK.status);
  });

  test('TOK-TC-004 Token invalido devuelve 403 INVALID_TOKEN (sin caer en 500) @TOK-TC-004', async () => {
    const res = await fetch(`${env.baseURL}/api/category`, {
      headers: { 'x-api-token': 'deadbeefdeadbeefdeadbeefdeadbeef' },
    });
    expect(res.status).toBe(403);
    const body = await res.text();
    // sm2 responde JSON o texto con INVALID_TOKEN o EXPIRED_TOKEN.
    expect(body).toMatch(/INVALID|EXPIRED|TOKEN/);
  });
});
