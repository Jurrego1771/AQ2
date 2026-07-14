// @ts-check
const { test, expect } = require('../../../src/fixtures');
const {
  ResourceRegistry,
  get,
  _resetForTests,
} = require('../../../src/fixtures/resource-registry');

/**
 * Unit del ResourceRegistry (no toca el server). Cubre el contrato del
 * tracker de ciclo de vida usado por ResourceCleaner + globalTeardown.
 *
 * Las 4 invariantes que el registry debe mantener:
 *   1. register() agrega a `created` (idempotente).
 *   2. markDeleted() mueve de `created` a `deleted` con timestamp.
 *   3. leaked() devuelve SOLO lo que quedo en `created` tras los deletes.
 *   4. stats() agrega por tipo y calcula percentiles de duracion.
 *
 * Ademas: el get() devuelve el MISMO singleton (estado compartido entre
 * cleaners per-test).
 */
test.describe('ResourceRegistry — unit @unit', () => {
  test.afterEach(() => _resetForTests());

  test('register agrega a created y leaked lo expone @LIVE-TC-92', () => {
    _resetForTests();
    const r = get();
    r.register('live-stream', 'abc123');
    r.register('live-stream', 'def456');
    expect(r.created.size).toBe(2);
    expect(r.deleted.size).toBe(0);
    const leaks = r.leaked();
    expect(leaks).toHaveLength(2);
    expect(leaks[0]).toMatchObject({ type: 'live-stream', id: 'abc123' });
    expect(leaks[0].ageMs).toBeGreaterThanOrEqual(0);
  });

  test('markDeleted mueve de created a deleted con timestamp y duracion @LIVE-TC-93', async () => {
    _resetForTests();
    const r = get();
    r.register('media', 'm1', { testId: 'test_a' });
    await new Promise((res) => setTimeout(res, 5));
    r.markDeleted('media', 'm1', 200);
    expect(r.created.size).toBe(0);
    expect(r.deleted.size).toBe(1);
    const d = r.deleted.get('media:m1');
    expect(d.testId).toBe('test_a');
    expect(d.status).toBe(200);
    expect(d.durationMs).toBeGreaterThanOrEqual(5);
    // leaked() ya no lo incluye.
    expect(r.leaked()).toHaveLength(0);
  });

  test('markDeleted con id no registrado lo agrega a deleted igual (auditoria) @LIVE-TC-94', () => {
    _resetForTests();
    const r = get();
    r.markDeleted('ad', 'external-id', 200);
    expect(r.created.size).toBe(0);
    expect(r.deleted.size).toBe(1);
    expect(r.deleted.get('ad:external-id').status).toBe(200);
  });

  test('register es idempotente: dos veces el mismo id no duplica @LIVE-TC-95', () => {
    _resetForTests();
    const r = get();
    r.register('live-stream', 'same');
    r.register('live-stream', 'same');
    r.register('live-stream', 'same', { testId: 'updated-meta' });
    expect(r.created.size).toBe(1);
    // El segundo register (con meta) actualizo el testId.
    expect(r.created.get('live-stream:same').testId).toBe('updated-meta');
  });

  test('get() devuelve el MISMO singleton (estado compartido entre cleaners) @LIVE-TC-96', () => {
    _resetForTests();
    const a = get();
    const b = get();
    expect(a).toBe(b);
    // Cualquier operacion en uno se ve en el otro.
    a.register('live-stream', 'shared');
    expect(b.created.has('live-stream:shared')).toBe(true);
  });

  test('stats() agrega por tipo y calcula p50/p95 de duraciones @LIVE-TC-97', async () => {
    _resetForTests();
    const r = get();
    r.register('live-stream', 'l1');
    r.register('live-stream', 'l2');
    r.register('media', 'm1');
    r.register('media', 'm2');
    r.register('media', 'm3');
    await new Promise((res) => setTimeout(res, 10));
    r.markDeleted('live-stream', 'l1', 200);
    r.markDeleted('media', 'm1', 200);
    r.markDeleted('media', 'm2', 200);
    // m3 queda leaked.

    const s = r.stats('runtest');
    expect(s.runId).toBe('runtest');
    expect(s.totals.created).toBe(5);
    expect(s.totals.deleted).toBe(3);
    expect(s.totals.leaked).toBe(2); // l2 + m3
    expect(s.totals.byType).toMatchObject({
      'live-stream': { created: 2, deleted: 1, leaked: 1 },
      media: { created: 3, deleted: 2, leaked: 1 },
    });
    expect(s.duration_ms.count).toBe(3);
    expect(s.duration_ms.p50).toBeGreaterThan(0);
    expect(s.leaked).toHaveLength(2);
    // Orden determinista del array (createdAt asc por Map).
    expect(s.leaked.map((l) => l.id)).toEqual(['l2', 'm3']);
  });
});