// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const { getSampleMediaId, createFastChannel, deleteFastChannel } = require('../../../../src/api/fast-channel-factory');

/**
 * @api @fast-channel — Creación de fast channel y vínculo con el live (US-038).
 *
 * Backend SEPARADO: dev-api.platform.mediastre.am/fast-channel (fixture fastChannelCtx,
 * auth x-api-token = jwt del storageState). El admin API (fixture `api`, sesión) se usa
 * para verificar el live-stream vinculado.
 *
 * Regla central: al crear un fast channel se crea un LIVE vinculado (`liveId`) con el
 * MISMO nombre. Verificado en vivo 2026-07-14; el DELETE del fast channel borra el live
 * en cascada. Self-contained: cada test crea y borra su propio canal.
 *
 * Contrato de validación (verificado): name/adBreakMedia/bumperMedia son required.
 */
test.describe('Fast Channel — creación y vínculo con el live @api @fast-channel', () => {
  test.skip(env.isProd, 'no se crean fast channels (MediaLive real) contra prod (prodGuard)');

  /** @type {string[]} ids de fast channel creados, a limpiar. */
  let created;
  test.beforeEach(() => { created = []; });
  test.afterEach(async ({ fastChannelCtx }) => {
    for (const id of created) await deleteFastChannel(fastChannelCtx, id).catch(() => {});
  });

  const uniqueName = (l) =>
    `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${l} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // ─── Happy path + vínculo con el live ───────────────────────────────────────
  test('crear un fast channel crea un live vinculado con el mismo nombre @FCH-TC-1', async ({ fastChannelCtx, api }) => {
    test.setTimeout(60_000); // crea recursos MediaLive reales
    const name = uniqueName('create');
    const fc = await createFastChannel(fastChannelCtx, { name });
    created.push(fc._id);

    expect(fc._id, 'fast channel creado').toBeTruthy();
    expect(fc.name).toBe(name);
    expect(fc.liveId, 'debe tener un live vinculado').toMatch(/^[0-9a-f]{24}$/);

    // El live vinculado existe (admin API) y tiene el MISMO nombre.
    const live = await api.get(`/api/live-stream/${fc.liveId}`);
    expect(live.status(), 'el live vinculado debe existir').toBe(200);
    const liveData = (await live.json()).data;
    expect(liveData.name, 'el live vinculado lleva el mismo nombre que el fast channel').toBe(name);
  });

  // ─── Validación de campos obligatorios ──────────────────────────────────────
  test('crear sin name responde 400 (name requerido) @FCH-TC-2', async ({ fastChannelCtx }) => {
    const media = await getSampleMediaId(fastChannelCtx);
    const res = await fastChannelCtx.post('/fast-channel', {
      data: { timezone: 'America/Santiago', adBreakMedia: media, bumperMedia: media },
    });
    expect(res.status()).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/name.*required/i);
  });

  test('crear sin adBreakMedia/bumperMedia responde 400 (requeridos) @FCH-TC-3', async ({ fastChannelCtx }) => {
    const res = await fastChannelCtx.post('/fast-channel', {
      data: { name: uniqueName('no-media'), timezone: 'America/Santiago' },
    });
    expect(res.status()).toBe(400);
    const body = JSON.stringify(await res.json());
    expect(body).toMatch(/adBreakMedia.*required/i);
    expect(body).toMatch(/bumperMedia.*required/i);
  });

  // ─── BUG vivo: nombre de solo espacios se acepta (no se trimea) ─────────────
  test('crear con nombre de solo espacios debe rechazarse 400 @FCH-TC-4', async ({ fastChannelCtx }) => {
    test.fail(
      true,
      'BUG Jurrego1771/AQ2#56: name="   " (solo espacios) se acepta (200) y crea el fast channel + ' +
        'live con nombre en blanco. name="" sí da 400: falta trim antes de validar required.'
    );
    test.setTimeout(60_000);
    const media = await getSampleMediaId(fastChannelCtx);
    const res = await fastChannelCtx.post('/fast-channel', {
      data: { name: '   ', timezone: 'America/Santiago', adBreakMedia: media, bumperMedia: media },
    });
    // Si (contra lo esperado) crea, lo registramos para limpiar y dejamos fallar la aserción.
    if (res.ok()) {
      const list = (await (await fastChannelCtx.get('/fast-channel/advanced')).json()).data || [];
      const junk = list.find((c) => c.name === '   ');
      if (junk) created.push(junk._id);
    }
    expect(res.status(), 'nombre de solo espacios debe rechazarse').toBe(400);
  });
});
