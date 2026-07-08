// @ts-check
const { test, expect } = require('../../src/fixtures');
const { ResourceCleaner } = require('../../src/fixtures/resource-cleaner');
const { env } = require('../../src/utils/env');

/**
 * API — Playlist: contrato de `/api/playlist` (@api @playlist).
 *
 * Una playlist agrupa medias bajo un `type` (manual | smart | series | playout).
 * Verificado en vivo (dev v7.0.70): el happy-path es sólido (crear/leer/borrar
 * responden 200 con el envelope estándar), PERO crear sin `name` NO se valida y
 * revienta el backend con 500 DB_ERROR (bug #36) en lugar de un 400.
 *
 * Escrituras self-contained: cada test crea su playlist y la borra en un
 * teardown idempotente (ResourceCleaner). En prod las escrituras se skipean.
 */
test.describe('Playlist API — contrato de /api/playlist @api @playlist', () => {
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  test('POST /api/playlist crea una playlist manual y devuelve 200 con _id y type @PLST-TC-1', async ({
    playlistClient,
    api,
  }) => {
    const cleaner = new ResourceCleaner(api);
    try {
      const res = await playlistClient.create({
        name: `[QA-AUTO] PL create ${Date.now()}`,
        type: 'manual',
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('OK');
      expect(body.data).toBeTruthy();
      expect(typeof body.data._id).toBe('string');
      expect(body.data.type).toBe('manual');
      cleaner.register('playlist', body.data._id);
    } finally {
      await cleaner.clean();
    }
  });

  test('GET /api/playlist/:id?all=true expone rules{manual,smart,series,playout} y access_rules @PLST-TC-2', async ({
    playlistClient,
    api,
  }) => {
    const cleaner = new ResourceCleaner(api);
    try {
      const created = await playlistClient.create({
        name: `[QA-AUTO] PL shape ${Date.now()}`,
        type: 'manual',
      });
      const id = (await created.json()).data._id;
      cleaner.register('playlist', id);

      const res = await playlistClient.getById(id);
      expect(res.status()).toBe(200);
      const { data } = await res.json();
      // Los 4 tipos de playlist conviven en el objeto rules (aunque solo uno esté activo).
      expect(data.rules).toMatchObject({
        manual: expect.anything(),
        smart: expect.anything(),
        series: expect.anything(),
        playout: expect.anything(),
      });
      // El bloque de restricciones de acceso viene siempre presente.
      expect(data.access_rules).toBeTruthy();
      expect(data.access_rules.geo).toBeTruthy();
    } finally {
      await cleaner.clean();
    }
  });

  test('DELETE /api/playlist/:id elimina la playlist y responde 200 OK @PLST-TC-3', async ({
    playlistClient,
  }) => {
    const created = await playlistClient.create({
      name: `[QA-AUTO] PL delete ${Date.now()}`,
      type: 'manual',
    });
    const id = (await created.json()).data._id;

    const del = await playlistClient.remove(id);
    expect(del.status()).toBe(200);
    expect((await del.json()).status).toBe('OK');

    // Tras borrar, el detalle ya no debe resolver como playlist existente.
    const after = await playlistClient.getById(id);
    expect(after.ok(), 'una playlist borrada no debe seguir resolviendo 200').toBeFalsy();
  });

  // --- Prueba viva del bug #36 ---
  // Crear una playlist sin `name` no se valida: el backend intenta persistir y
  // revienta a nivel de BD -> 500 {status:'ERROR',data:'DB_ERROR'}. Debería
  // responder 400 con un error de validación. Roja-esperada hasta corregir #36.
  //
  // Si el fix hiciera que igualmente se cree algo (no debería), el cleaner lo
  // recoge; hoy no se crea nada porque la inserción falla.
  test('POST /api/playlist rechaza un nombre vacío con 400, no 500 [BUG #36] @PLST-TC-4', async ({
    playlistClient,
    api,
  }) => {
    test.fail(
      true,
      'BUG sm2#8504: crear playlist sin nombre devuelve 500 DB_ERROR — https://github.com/mediastream/sm2/issues/8504'
    );
    const cleaner = new ResourceCleaner(api);
    try {
      const res = await playlistClient.create({ name: '', type: 'manual' });
      const body = await res.json().catch(() => ({}));
      if (res.ok() && body?.data?._id) cleaner.register('playlist', body.data._id);
      expect(
        res.status(),
        'un nombre vacío es un error de validación (4xx), no un fallo de servidor (5xx)'
      ).toBe(400);
    } finally {
      await cleaner.clean();
    }
  });

  // ---- PR sm2#8076: flag `uses_reels` en la entidad Playlist ----
  // Verificado en vivo (dev v7.0.71): create acepta uses_reels (default false al
  // omitirlo), GET ?uses_reels=true filtra solo las marcadas, y el update es
  // POST /:id (no PUT) — el valor false persiste (caso frágil falsy, cf. bug #23
  // en schedules donde el false NO persistía).

  test('POST /api/playlist persiste uses_reels:true y default a false al omitirlo @PLST-TC-8', async ({
    playlistClient,
    api,
  }) => {
    const cleaner = new ResourceCleaner(api);
    try {
      // uses_reels:true -> persiste true
      const on = await playlistClient.create({
        name: `[QA-AUTO] PL reels-on ${Date.now()}`,
        type: 'manual',
        uses_reels: true,
      });
      expect(on.status()).toBe(200);
      const onData = (await on.json()).data;
      cleaner.register('playlist', onData._id);
      expect(onData.uses_reels, 'uses_reels:true debe persistir en la creación').toBe(true);
      // releído desde el detalle, sigue en true
      const onGet = (await (await playlistClient.getById(onData._id)).json()).data;
      expect(onGet.uses_reels).toBe(true);

      // omitido -> el backend lo persiste en false (default)
      const off = await playlistClient.create({
        name: `[QA-AUTO] PL reels-default ${Date.now()}`,
        type: 'manual',
      });
      expect(off.status()).toBe(200);
      const offData = (await off.json()).data;
      cleaner.register('playlist', offData._id);
      expect(offData.uses_reels, 'sin el campo, uses_reels default a false').toBe(false);
    } finally {
      await cleaner.clean();
    }
  });

  test('GET /api/playlist?uses_reels=true devuelve solo playlists marcadas para reels @PLST-TC-9', async ({
    playlistClient,
    api,
  }) => {
    const cleaner = new ResourceCleaner(api);
    try {
      const flagged = (await (await playlistClient.create({
        name: `[QA-AUTO] PL reels-yes ${Date.now()}`,
        type: 'manual',
        uses_reels: true,
      })).json()).data;
      cleaner.register('playlist', flagged._id);

      const plain = (await (await playlistClient.create({
        name: `[QA-AUTO] PL reels-no ${Date.now()}`,
        type: 'manual',
      })).json()).data;
      cleaner.register('playlist', plain._id);

      const res = await playlistClient.list({ uses_reels: true });
      expect(res.status()).toBe(200);
      const items = (await res.json()).data;
      expect(Array.isArray(items), 'el listado filtrado debe venir como array').toBe(true);
      const ids = items.map((p) => p._id);
      expect(ids, 'la playlist marcada debe aparecer en el filtro').toContain(flagged._id);
      expect(ids, 'la playlist NO marcada no debe aparecer en el filtro').not.toContain(plain._id);
      // el filtro es honesto: cada elemento devuelto tiene el flag activo
      expect(items.every((p) => p.uses_reels === true), 'el filtro solo debe traer uses_reels=true').toBe(true);
    } finally {
      await cleaner.clean();
    }
  });

  test('POST /api/playlist/:id apaga uses_reels y el false persiste @PLST-TC-10', async ({
    playlistClient,
    api,
  }) => {
    const cleaner = new ResourceCleaner(api);
    try {
      const name = `[QA-AUTO] PL reels-toggle ${Date.now()}`;
      const created = (await (await playlistClient.create({ name, type: 'manual', uses_reels: true })).json()).data;
      cleaner.register('playlist', created._id);
      expect(created.uses_reels).toBe(true);

      // update true -> false (mismo body que envía el form: name+type+flag)
      const upd = await playlistClient.update(created._id, { name, type: 'manual', uses_reels: false });
      expect(upd.status(), 'el update es POST /:id (no PUT)').toBe(200);

      const after = (await (await playlistClient.getById(created._id)).json()).data;
      expect(after.uses_reels, 'uses_reels=false (falsy) debe persistir, no ignorarse').toBe(false);
    } finally {
      await cleaner.clean();
    }
  });
});
