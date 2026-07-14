// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const {
  createFastChannel, deleteFastChannel, getFastChannel, updateFastChannel,
  getSampleMediaId, addScheduleBlock, getSchedule,
} = require('../../../../src/api/fast-channel-factory');

/**
 * @api @fast-channel — Opciones de un fast channel ya creado (US-038).
 *
 * Edición por POST /fast-channel/:id (verificado; PUT/PATCH dan 403). Cada test
 * crea su propio canal (recursos MediaLive reales, ~25s) y lo borra en afterEach.
 * Para minimizar el costo, se agrupan aserciones afines en un mismo canal.
 */
test.describe('Fast Channel — opciones del canal creado @api @fast-channel', () => {
  test.skip(env.isProd, 'no se crean fast channels (MediaLive real) contra prod (prodGuard)');
  test.describe.configure({ timeout: 90_000 });

  /** @type {string[]} */
  let created;
  test.beforeEach(() => { created = []; });
  test.afterEach(async ({ fastChannelCtx }) => {
    for (const id of created) await deleteFastChannel(fastChannelCtx, id).catch(() => {});
  });

  const uniqueName = (l) =>
    `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${l} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  async function newChannel(fastChannelCtx, label) {
    const fc = await createFastChannel(fastChannelCtx, { name: uniqueName(label) });
    created.push(fc._id);
    return fc;
  }

  // ─── Editar opciones (persisten) ────────────────────────────────────────────
  test('editar nombre/timezone/syncByBlock/adBreak-bumper persiste @FCH-TC-5', async ({ fastChannelCtx }) => {
    const fc = await newChannel(fastChannelCtx, 'opts');
    const media = await getSampleMediaId(fastChannelCtx);
    const newName = uniqueName('renamed');

    expect((await updateFastChannel(fastChannelCtx, fc._id, { name: newName })).status()).toBe(200);
    expect((await updateFastChannel(fastChannelCtx, fc._id, { timezone: 'UTC' })).status()).toBe(200);
    expect((await updateFastChannel(fastChannelCtx, fc._id, { syncByBlock: true })).status()).toBe(200);
    expect((await updateFastChannel(fastChannelCtx, fc._id, { adBreakMedia: media, bumperMedia: media })).status()).toBe(200);

    const after = await getFastChannel(fastChannelCtx, fc._id);
    expect(after.name).toBe(newName);
    expect(after.timezone).toBe('UTC');
    expect(after.syncByBlock).toBe(true);
    expect(after.adBreakMedia).toBe(media);
    expect(after.bumperMedia).toBe(media);
  });

  // ─── El rename del fast channel NO cambia el nombre del live vinculado ──────
  test('renombrar el fast channel no altera el nombre del live vinculado @FCH-TC-6', async ({ fastChannelCtx, api }) => {
    const fc = await newChannel(fastChannelCtx, 'rename-live');
    const originalLiveName = uniqueName('rename-live'); // == fc.name al crear (verificado en FCH-TC-1)
    expect(fc.name).toContain('rename-live');

    // renombrar el fast channel
    const newName = uniqueName('fc-renamed');
    expect((await updateFastChannel(fastChannelCtx, fc._id, { name: newName })).status()).toBe(200);
    expect((await getFastChannel(fastChannelCtx, fc._id)).name).toBe(newName);

    // el live vinculado conserva el nombre con que se creó (contrato: solo al crear).
    const live = await api.get(`/api/live-stream/${fc.liveId}`);
    const liveName = (await live.json()).data.name;
    expect(liveName, 'el live NO sigue el rename del fast channel').not.toBe(newName);
    expect(liveName).toBe(fc.name); // el nombre original de creación
  });

  // ─── Agregar un bloque de programación aparece en el schedule del canal ─────
  test('agregar un bloque de programación aparece en el schedule del fast channel @FCH-TC-7', async ({ fastChannelCtx }) => {
    const fc = await newChannel(fastChannelCtx, 'sched');
    const media = await getSampleMediaId(fastChannelCtx);
    expect(await getSchedule(fastChannelCtx, fc._id)).toHaveLength(0);

    const res = await addScheduleBlock(fastChannelCtx, fc._id, {
      name: 'QA block',
      startTime: new Date(Date.now() + 3600e3).toISOString(),
      items: [{ media, duration: 60 }],
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(body.data?.name).toBe('QA block');
    expect(Array.isArray(body.data?.items) && body.data.items.length).toBeTruthy();

    // aparece en la programación del fast channel
    expect(await getSchedule(fastChannelCtx, fc._id)).toHaveLength(1);
  });

  // ─── BUG vivo: el update no valida el nombre (vacío/espacios) ───────────────
  test('editar el nombre a vacío/espacios debe rechazarse 400 @FCH-TC-8', async ({ fastChannelCtx }) => {
    test.fail(
      true,
      'BUG Jurrego1771/AQ2#56: POST /fast-channel/:id acepta name="" y name="   " (200), dejando ' +
        'el canal sin nombre. El create valida name required; el update no valida nada.'
    );
    const fc = await newChannel(fastChannelCtx, 'falsy-update');
    const res = await updateFastChannel(fastChannelCtx, fc._id, { name: '' });
    expect(res.status(), 'vaciar el nombre debe rechazarse').toBe(400);
  });
});
