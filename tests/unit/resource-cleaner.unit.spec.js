// @ts-check
const { test, expect } = require('../../src/fixtures');
const { ResourceCleaner, shouldRetry } = require('../../src/fixtures/resource-cleaner');
const { get: getRegistry, _resetForTests } = require('../../src/fixtures/resource-registry');

/**
 * Unit del ResourceCleaner contra un mock de api (no toca el server).
 * Cubre la politica de retry: 5xx transitorio -> reintenta, 4xx -> no.
 */
test.describe('ResourceCleaner — retry policy @unit', () => {
  test.afterEach(() => _resetForTests());

  test('shouldRetry: 5xx y 429 si, 4xx y 2xx no @LIVE-TC-101', () => {
    expect(shouldRetry(0)).toBe(true); // network error
    expect(shouldRetry(429)).toBe(true);
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(502)).toBe(true);
    expect(shouldRetry(503)).toBe(true);
    expect(shouldRetry(599)).toBe(true);
    // 4xx no se reintenta
    expect(shouldRetry(400)).toBe(false);
    expect(shouldRetry(404)).toBe(false);
    expect(shouldRetry(409)).toBe(false);
    expect(shouldRetry(422)).toBe(false);
    // 2xx no se reintenta (no hay error)
    expect(shouldRetry(200)).toBe(false);
    expect(shouldRetry(204)).toBe(false);
  });

  test('cleaner: 502 transient -> reintenta y eventualmente borra @LIVE-TC-102', async () => {
    _resetForTests();
    let calls = 0;
    const api = {
      delete: async () => {
        calls += 1;
        if (calls < 3) {
          return { status: () => 502, ok: () => false };
        }
        return { status: () => 200, ok: () => true };
      },
    };
    const cleaner = new ResourceCleaner(api, { testId: 'test_502' });
    cleaner.register('live-stream', 'abc');
    // Sin backoff real (el setTimeout se respeta pero con 1s base x 2^0 = 1s
    // para attempt 1 -> 2, y 1s x 2^1 = 2s para attempt 2 -> 3, total ~3s).
    // Para tests rapidos, override maxAttempts=5 igual; el delay se respeta.
    const start = Date.now();
    await cleaner.clean();
    const elapsed = Date.now() - start;
    expect(calls).toBe(3); // 2 fails + 1 success
    expect(elapsed).toBeGreaterThanOrEqual(1000); // al menos 1 sleep
    // Registry: 1 deleted, 0 leaked.
    const reg = getRegistry();
    expect(reg.deleted.size).toBe(1);
    expect(reg.created.size).toBe(0);
  });

  test('cleaner: 4xx no se reintenta y queda como leaked (registry) @LIVE-TC-103', async () => {
    _resetForTests();
    let calls = 0;
    const api = {
      delete: async () => {
        calls += 1;
        return { status: () => 400, ok: () => false };
      },
    };
    const cleaner = new ResourceCleaner(api, { testId: 'test_4xx' });
    cleaner.register('media', 'm1');
    // Override maxAttempts=2 para que el test no tarde tanto.
    cleaner.maxAttempts = 2;
    await cleaner.clean();
    expect(calls).toBe(1); // 4xx -> no retry
    const reg = getRegistry();
    expect(reg.deleted.size).toBe(0);
    expect(reg.created.size).toBe(1);
    // 4xx deja un WARN log, no se verifica explicito.
  });

  test('cleaner: 5xx persiste tras 5 intentos -> queda como leaked y registra WARN @LIVE-TC-104', async () => {
    _resetForTests();
    let calls = 0;
    const api = {
      delete: async () => {
        calls += 1;
        return { status: () => 502, ok: () => false };
      },
    };
    const cleaner = new ResourceCleaner(api, { testId: 'test_5xx_perma' });
    cleaner.register('live-stream', 'permaleak');
    cleaner.maxAttempts = 2; // bajamos para que el test sea rapido
    // Capturamos console.warn para verificar el log.
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    try {
      await cleaner.clean();
    } finally {
      console.warn = origWarn;
    }
    expect(calls).toBe(2);
    const reg = getRegistry();
    expect(reg.deleted.size).toBe(0);
    expect(reg.created.size).toBe(1);
    expect(reg.leaked()).toHaveLength(1);
    // El WARN incluye el testId y el status.
    expect(warns.some((w) => w.includes('test_5xx_perma') && w.includes('leaked'))).toBe(true);
  });

  test('cleaner: 404 cuenta como borrado (ya no existe) @LIVE-TC-105', async () => {
    _resetForTests();
    const api = {
      delete: async () => ({ status: () => 404, ok: () => false }),
    };
    const cleaner = new ResourceCleaner(api, { testId: 'test_404' });
    cleaner.register('live-stream', 'gone');
    await cleaner.clean();
    const reg = getRegistry();
    expect(reg.deleted.size).toBe(1);
    expect(reg.deleted.get('live-stream:gone').status).toBe(404);
    expect(reg.created.size).toBe(0);
  });

  test('cleaner: backoff exponencial (1s, 2s, 4s...) respeta los delays @LIVE-TC-106', async () => {
    _resetForTests();
    const start = Date.now();
    const api = {
      delete: async () => ({ status: () => 502, ok: () => false }),
    };
    const cleaner = new ResourceCleaner(api, { testId: 'test_backoff' });
    cleaner.register('live-stream', 'slow');
    cleaner.maxAttempts = 3; // 2 sleeps: 1s + 2s = 3s total
    await cleaner.clean();
    const elapsed = Date.now() - start;
    // Toleramos un poco de overhead (jitter). Esperamos >= 2.5s.
    expect(elapsed).toBeGreaterThanOrEqual(2500);
    // Con maxAttempts=3 son: attempt 1 (no sleep) + sleep 1s + attempt 2 + sleep 2s + attempt 3
    // Total sleeps: 1 + 2 = 3s. Con jitter, 2.5s-4s.
  });
});