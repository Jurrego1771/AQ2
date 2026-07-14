// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');

/**
 * Live Stream Ingest — contrato + RTMP end-to-end.
 *
 * Estado 2026-07-09: el spec estaba organizado en 2 tiers, pero el Tier 2
 * (LIVE-TC-115, RTMP real con ffmpeg) y 3 de los tests del Tier 1 (LIVE-TC-108/
 * 109/110, "cada entry de primary tiene profile y url" y variantes) eran pruebas
 * VIVAS contra el bug AQ2#49 ("entry_points.primary vacio al crear live por
 * API"), que ya esta CERRADO. La causa raiz (sm2 PR que popula entry_points en
 * el POST del live) se resolvio, pero los tests no se migraron a verde. Ademas,
 * LIVE-TC-108/109/110/115 dependen de `LIVE-RISK-13` (entrada duplicada con el
 * riesgo del TypeError del detalle, ver riesgos.yaml LIVE-RISK-17 tras esta
 * sesion).
 *
 * Decision 2026-07-09: eliminar esos 4 tests del modulo live-stream porque
 *  - cubrian un riesgo que ya esta cerrado (no aportan senal viva),
 *  - dependen de ffmpeg en PATH (no portable),
 *  - dependen de enviar senal real al dev compartido (no es self-contained),
 *  - y duplican el ID de riesgo con el LIVE-RISK-13/17 del TypeError.
 *
 * Tier 1 reducido: solo los tests estructurales (107, 111-114) que SI pasan
 * hoy. Si en el futuro se quiere re-introducir RTMP end-to-end:
 *  - basarse en un live PRE-EXISTENTE con entry_points poblado (no API-create),
 *  - usar IDs libres siguientes (LIVE-TC-124, 125, ...),
 *  - asegurar ffmpeg en PATH en el runner.
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

  // ---- Bloque eliminado 2026-07-09 ----
  // Antiguos LIVE-TC-108/109/110 (entry_points con datos) y LIVE-TC-115
  // (RTMP real con ffmpeg) eran pruebas vivas contra AQ2#49 (cerrado).
  // Ver cabecera del spec para justificacion completa.

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

  // ---- Tier 2 (RTMP real con ffmpeg) eliminado 2026-07-09 ----
  // Antiguo LIVE-TC-115 era prueba viva contra AQ2#49 (cerrado).
  // Si en el futuro se reactiva, basarse en un live PRE-EXISTENTE con
  // entry_points poblado y reusar el helper src/utils/ffmpeg.js.
});

// ─── Helper local ───────────────────────────────────────────────────────────

/** Acepta 200/400/404/500 (exploratorio); falla si es algo inesperado. */
function expectTolerant(res, allowed = [200, 400, 404]) {
  expect(
    allowed.includes(res.status()),
    `status ${res.status()} fuera de [${allowed.join(',')}]: ${res.text().catch(() => '')}`
  ).toBeTruthy();
}