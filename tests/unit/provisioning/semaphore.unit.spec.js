// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { Semaphore, get, _resetForTests } = require('../../../src/utils/semaphore');

/**
 * F7 — unit del semáforo (no toca el server). Verifica que:
 *   - permits=0 desactiva la cola (corre inline).
 *   - permits>0 serializa las operaciones que exceden el cupo.
 *   - Los errores no rompen la cola.
 *   - queueDepth() / inflight() reportan el estado real.
 *
 * No valida AC de producto: protege lainfra de rate-limit del dev.
 */
test.describe('Semaphore — unit @unit', () => {
  test.afterEach(() => _resetForTests());

  test('permits=0 corre inline (sin cola) @LIVE-TC-27', async () => {
    const sem = new Semaphore(0);
    let concurrent = 0;
    let maxConcurrent = 0;
    const task = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent -= 1;
      return 1;
    };
    // 5 tasks en paralelo: como permits=0, todas arrancan a la vez.
    await Promise.all(Array.from({ length: 5 }, () => sem.withPermit(task)));
    expect(maxConcurrent).toBe(5);
    expect(sem.queueDepth()).toBe(0);
    expect(sem.inflight()).toBe(0);
  });

  test('permits=2 serializa a 2 en vuelo @LIVE-TC-28', async () => {
    const sem = new Semaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;
    const task = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent -= 1;
      return 1;
    };
    await Promise.all(Array.from({ length: 6 }, () => sem.withPermit(task)));
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(maxConcurrent).toBeGreaterThanOrEqual(2); // llegó al cupo en algún momento
    expect(sem.inflight()).toBe(0);
  });

  test('permits=1 serializa todo (FIFO) @LIVE-TC-29', async () => {
    const sem = new Semaphore(1);
    let concurrent = 0;
    let maxConcurrent = 0;
    const order = [];
    const task = (id) => async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      order.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`end:${id}`);
      concurrent -= 1;
      return id;
    };
    const results = await Promise.all([
      sem.withPermit(task(1)),
      sem.withPermit(task(2)),
      sem.withPermit(task(3)),
      sem.withPermit(task(4)),
    ]);
    expect(maxConcurrent).toBe(1);
    // Serialización estricta: la 2 arranca solo cuando la 1 termina.
    expect(order).toEqual([
      'start:1',
      'end:1',
      'start:2',
      'end:2',
      'start:3',
      'end:3',
      'start:4',
      'end:4',
    ]);
    expect(results).toEqual([1, 2, 3, 4]);
  });

  test('un error no rompe la cola (siguiente tarea corre igual) @LIVE-TC-30', async () => {
    const sem = new Semaphore(1);
    const failing = sem.withPermit(async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    // La cola debe haber avanzado: la siguiente tarea corre normal.
    const ok = await sem.withPermit(async () => 'ok');
    expect(ok).toBe('ok');
    expect(sem.inflight()).toBe(0);
  });

  test('get(name) devuelve la misma instancia (registry por proceso) @LIVE-TC-31', () => {
    _resetForTests();
    const a = get('live-stream', 2);
    const b = get('live-stream');
    expect(a).toBe(b);
    // Otro nombre -> otra instancia.
    const c = get('media', 2);
    expect(c).not.toBe(a);
  });
});