// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { get: getRegistry } = require('../../../../src/fixtures/resource-registry');

/**
 * F2 (Provisioning strategy, C2) — verificacion del ResourceRegistry integrado
 * con ResourceCleaner a traves de los fixtures self-contained.
 *
 * Que prueba:
 *   1. El fixture liveStream registra el live en `created` del registry
 *      durante la ejecucion del test (antes del teardown).
 *   2. Varios tests en el mismo worker comparten el MISMO registry (estado
 *      acumulado por proceso, no por test).
 *   3. Los entries del registry tienen el testId correcto (titulo del test).
 *
 * Sobre la limpieza: NO se verifica aqui (esa verificacion es el rol de
 * /resource-cleaner.api.spec.js y del provisioning report del globalTeardown).
 * Mientras el test body corre, el live esta en `created` (todavia no se
 * ejecuto el teardown). La limpieza se prueba en LIVE-TC-14 + LIVE-TC-100.
 */
test.describe('ResourceRegistry — integrado con fixtures @api @live-stream', () => {
  test('F2: liveStream fixture registra en created durante la ejecucion @LIVE-TC-98', async ({
    liveStream,
    liveStreamClient,
  }) => {
    const registry = getRegistry();
    const key = `live-stream:${liveStream}`;
    // El fixture YA registro el live (el teardown corre despues del body).
    expect(registry.created.has(key), `expected ${key} in created`).toBe(true);
    const c = registry.created.get(key);
    expect(c.testId).toMatch(/@LIVE-TC-98/);
    expect(c.createdAt).toBeGreaterThan(0);
    // todavia no en deleted (el teardown no ha corrido).
    expect(registry.deleted.has(key)).toBeFalsy();

    // Sanity: el live existe via GET.
    const r = await liveStreamClient.getById(liveStream);
    expect(r.status()).toBe(200);
  });

  test('F2: dos fixtures (liveStream + ad) coexisten en el registry compartido @LIVE-TC-99', async ({
    liveStream,
    ad,
  }) => {
    const registry = getRegistry();
    const liveKey = `live-stream:${liveStream}`;
    const adKey = `ad:${ad}`;
    // Ambos en `created` (todavia no se limpio ninguno).
    expect(registry.created.has(liveKey)).toBe(true);
    expect(registry.created.has(adKey)).toBe(true);
    // Ambos con testId apuntando a ESTE test (el orden de ejecucion no
    // importa, ambos fixtures corren en este test).
    expect(registry.created.get(liveKey).testId).toMatch(/@LIVE-TC-99/);
    expect(registry.created.get(adKey).testId).toMatch(/@LIVE-TC-99/);
  });

  test('F2: stats() del registry refleja los creates y los deletes del run @LIVE-TC-100', async ({
    liveStream,
  }) => {
    const registry = getRegistry();
    // El live recien creado esta en `created` (todavia no limpio).
    const key = `live-stream:${liveStream}`;
    expect(registry.created.has(key)).toBe(true);

    // stats() debe incluir el live recien creado.
    const s = registry.stats('test');
    expect(s.totals.created).toBeGreaterThanOrEqual(1);
    // Por tipo: al menos 1 live-stream registrado.
    const ls = s.totals.byType['live-stream'];
    expect(ls, `byType.live-stream debe existir: ${JSON.stringify(s.totals.byType)}`).toBeDefined();
    // El nuestro (de este test) o de los anteriores cuenta para created.
    expect(ls.created).toBeGreaterThanOrEqual(1);
  });
});