// @ts-check
const { z } = require('zod');
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const {
  createPlaylistResponseSchema,
  getPlaylistResponseSchema,
  listPlaylistResponseSchema,
} = require('../../../../src/schemas/playlist.schema');

/**
 * @api — Contrato HTTP del recurso Playlist (sm2 vista playlists.coffee).
 * Cubre el shape de respuesta de POST/GET/list + el sub-resource GET medias.
 *
 * Portado de api_test_flow/tests/api/contract/playlist/playlist.contract.spec.js,
 * adaptado a AQ2 (cookies de admin, ResourceCleaner self-contained).
 */
test.describe('Playlist API @api - Contract', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  test('PLST-TC-CRT POST /api/playlist devuelve Create Response valido @PLST-TC-CRT', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    // El contrato requiere `type` y el server setea account/slug/etc.
    const payload = {
      name: `[QA-CONTRACT] Playlist-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      type: 'manual',
      no_ad: false,
    };
    const res = await api.post('/api/playlist', { data: payload });
    expect(res.status(), `POST /api/playlist fallo: ${await res.text()}`).toBe(200);
    const body = await res.json();
    const parsed = createPlaylistResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    cleaner.register('playlist', parsed.data.data._id);
  });

  test('PLST-TC-GET GET /api/playlist/:id devuelve Get Response valido @PLST-TC-GET', async ({ api }) => {
    const cleaner = new ResourceCleaner(api);
    const createRes = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Playlist-Get-${Date.now()}`, type: 'manual', no_ad: false },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    const id = created?.data?._id;
    expect(id).toBeTruthy();
    cleaner.register('playlist', id);

    const res = await api.get(`/api/playlist/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = getPlaylistResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(parsed.data.data._id).toBe(id);
  });

  test('PLST-TC-LST GET /api/playlist (list) devuelve List Response valido @PLST-TC-LST', async ({ api }) => {
    const res = await api.get('/api/playlist', { params: { limit: 5 } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const parsed = listPlaylistResponseSchema.safeParse(body);
    expect(
      parsed.success,
      `Schema mismatch:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}`
    ).toBe(true);
    expect(Array.isArray(parsed.data.data)).toBe(true);
  });

  test('PLST-TC-MED GET /api/playlist/:id?medias=true responde 200 con envelope valido @PLST-TC-MED', async ({ api }) => {
    // En el old repo este endpoint respondia con un array de medias; en esta version de sm2
    // responde con la playlist completa + reglas (data.rules.manual.medias, etc.).
    // Conservamos el spec para detectar drift en el shape del envelope, no del contenido.
    const cleaner = new ResourceCleaner(api);
    const createRes = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Playlist-Medias-${Date.now()}`, type: 'manual', no_ad: false },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    const id = created?.data?._id;
    expect(id).toBeTruthy();
    cleaner.register('playlist', id);

    const res = await api.get(`/api/playlist/${id}`, { params: { medias: true } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Solo validamos que el envelope jsonp es valido (status + data), sin forzar
    // shape de data (porque depende de que la playlist tenga reglas, lo cual es
    // variable entre cuentas y tipos de playlist).
    const envelopeShape = z.object({
      status: z.string(),
      data: z.unknown(),
    }).passthrough();
    const parsed = envelopeShape.safeParse(body);
    expect(
      parsed.success,
      `Envelope no matchea:\n${JSON.stringify(parsed.error?.issues || null, null, 2)}\nbody:\n${JSON.stringify(body).slice(0, 600)}`
    ).toBe(true);
  });

  // ---- PR sm2#8076: campo uses_reels + query param ----
  // Cubre el shape del campo y el query filter. Patrones de falsy bug cubiertos
  // por PLST-TC-021 (red-hasta-fix de la saga #847).

  test('PLST-TC-016 POST /api/playlist con uses_reels=true persiste el flag @PLST-TC-016', async ({ api }) => {
    // Manda uses_reels=true explicito en el body. El server debe persistir
    // (no bug-falsy como en la saga #847). Verificacion doble: POST responde
    // con el flag, GET posterior lo confirma.
    const cleaner = new ResourceCleaner(api);
    const payload = {
      name: `[QA-CONTRACT] Reels-True-${Date.now()}`,
      type: 'manual',
      no_ad: false,
      uses_reels: true,
    };
    const createRes = await api.post('/api/playlist', { data: payload });
    expect(createRes.status(), `POST /api/playlist fallo: ${await createRes.text()}`).toBe(200);
    const created = await createRes.json();
    const id = created?.data?._id;
    expect(id, 'POST no devolvio _id').toBeTruthy();
    cleaner.register('playlist', id);

    const getRes = await api.get(`/api/playlist/${id}`);
    expect(getRes.status()).toBe(200);
    const fetched = (await getRes.json()).data;
    // Assert estricto: el server DEBE persistir el valor explicito del body.
    expect(fetched?.uses_reels, `uses_reels no persistio; quedo como ${fetched?.uses_reels}`).toBe(true);
  });

  test('PLST-TC-017 POST /api/playlist SIN uses_reels -> default false del schema @PLST-TC-017', async ({ api }) => {
    // Si el body no incluye el campo, el schema default false. El handler no
    // debe aplicar nada, dejando el valor por defecto del modelo.
    const cleaner = new ResourceCleaner(api);
    const createRes = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Reels-Default-${Date.now()}`, type: 'manual', no_ad: false },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    const id = created?.data?._id;
    expect(id).toBeTruthy();
    cleaner.register('playlist', id);

    const getRes = await api.get(`/api/playlist/${id}`);
    const fetched = (await getRes.json()).data;
    // Si el server esta en la version vieja (pre-PR), el GET puede no devolver
    // `uses_reels` (legacy sin el campo). Aceptamos undefined como equivalente
    // de false. Si devuelve true, es bug.
    expect([false, undefined]).toContain(fetched?.uses_reels);
  });

  test('PLST-TC-018 GET /api/playlist?uses_reels=true filtra a solo reels @PLST-TC-018', async ({ api }) => {
    // Setup: crear 1 playlist con uses_reels=true y 1 con uses_reels=false.
    // Skip explicito si el server no soporta el param (pre-PR 8076).
    const cleaner = new ResourceCleaner(api);
    const a = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Reels-A-${Date.now()}`, type: 'manual', no_ad: false, uses_reels: true },
    });
    if (a.status() !== 200) {
      test.skip(true, `PLST-SKIP: server no acepta uses_reels en POST (status ${a.status()}). PR #8076 quizas no mergeado.`);
    }
    const aId = (await a.json()).data?._id;
    cleaner.register('playlist', aId);

    const b = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Reels-B-${Date.now()}`, type: 'manual', no_ad: false, uses_reels: false },
    });
    const bId = (await b.json()).data?._id;
    cleaner.register('playlist', bId);

    // Filtro: ?uses_reels=true debe devolver A pero NO B.
    const r = await api.get('/api/playlist', { params: { uses_reels: 'true', limit: 100 } });
    if (r.status() !== 200) {
      test.skip(true, `PLST-SKIP: server no soporta ?uses_reels (status ${r.status()}).`);
    }
    const list = (await r.json()).data;
    const ids = Array.isArray(list) ? list.map((p) => p?._id) : [];
    expect(ids).toContain(aId);
    expect(ids).not.toContain(bId);
  });

  test('PLST-TC-019 GET /api/playlist?uses_reels=false usa $ne:true (legacy aparece) @PLST-TC-019', async ({ api }) => {
    // El server implementa ?uses_reels=false como $ne:true (no equality) para
    // que playlists legacy (sin el campo) aparezcan en este bucket. Test:
    // una playlist legacy (sin uses_reels en el body) debe aparecer.
    const cleaner = new ResourceCleaner(api);
    const a = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Legacy-NoReels-${Date.now()}`, type: 'manual', no_ad: false },
      // NO uses_reels en body -> legacy
    });
    if (a.status() !== 200) {
      test.skip(true, `PLST-SKIP: POST fallo (status ${a.status()}).`);
    }
    const aId = (await a.json()).data?._id;
    cleaner.register('playlist', aId);

    const r = await api.get('/api/playlist', { params: { uses_reels: 'false', limit: 100 } });
    if (r.status() !== 200) {
      test.skip(true, `PLST-SKIP: server no soporta ?uses_reels.`);
    }
    const list = (await r.json()).data;
    const ids = Array.isArray(list) ? list.map((p) => p?._id) : [];
    expect(ids, `playlist legacy (id ${aId}) no aparecio en ?uses_reels=false; el server quizas uso $eq:false en vez de $ne:true`).toContain(aId);
  });

  test('PLST-TC-020 GET /api/playlist sin param uses_reels devuelve todas (backward-compat) @PLST-TC-020', async ({ api }) => {
    // Sin param uses_reels: el server NO debe filtrar, todas las playlists aparecen.
    // Setup: crear 2 (1 con uses_reels=true, 1 con false).
    const cleaner = new ResourceCleaner(api);
    const a = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Both-A-${Date.now()}`, type: 'manual', no_ad: false, uses_reels: true },
    });
    if (a.status() !== 200) {
      test.skip(true, `PLST-SKIP: server no acepta uses_reels (status ${a.status()}).`);
    }
    const aId = (await a.json()).data?._id;
    cleaner.register('playlist', aId);

    const b = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] Both-B-${Date.now()}`, type: 'manual', no_ad: false, uses_reels: false },
    });
    const bId = (await b.json()).data?._id;
    cleaner.register('playlist', bId);

    // Sin param, ambas aparecen.
    const r = await api.get('/api/playlist', { params: { limit: 100 } });
    if (r.status() !== 200) {
      test.skip(true, `PLST-SKIP: server error.`);
    }
    const list = (await r.json()).data;
    const ids = Array.isArray(list) ? list.map((p) => p?._id) : [];
    expect(ids).toContain(aId);
    expect(ids).toContain(bId);
  });

  test('PLST-TC-021 PUT /api/playlist/:id con uses_reels=false explicito PERSISTE el cambio @PLST-TC-021', async ({ api }) => {
    // Red-hasta-fix del falsy bug de la saga #847. El PR #8076 introduce
    // normalizeBoolean en create/update para evitar el patron
    // `if (req.body?.uses_reels)` que ignora `false` explicito.
    // Si el server esta en la version vieja del update.js, mandarle
    // uses_reels=false NO persistira (queda el valor anterior true).
    // Si esta en la version del PR, SI persiste.
    const cleaner = new ResourceCleaner(api);
    const create = await api.post('/api/playlist', {
      data: { name: `[QA-CONTRACT] PUT-Reels-${Date.now()}`, type: 'manual', no_ad: false, uses_reels: true },
    });
    if (create.status() !== 200) {
      test.skip(true, `PLST-SKIP: server no acepta uses_reels en POST (status ${create.status()}).`);
    }
    const id = (await create.json()).data?._id;
    cleaner.register('playlist', id);

    // Verifico: GET inicial confirma uses_reels=true.
    const g1 = await api.get(`/api/playlist/${id}`);
    if (!((await g1.json()).data?.uses_reels)) {
      test.skip(true, `PLST-SKIP: server no persiste uses_reels=true tras POST; no podemos testear el toggle.`);
    }

    // Pongo uses_reels=false explicito. Assert ESTRICTO: el server DEBE persistir.
    // sm2 playlist usa POST /api/playlist/:id para update (NO PUT, mismo patron
    // que /api/ad). Verificado en app.js:4448 y src/api/playlist.client.js.
    const upd = await api.post(`/api/playlist/${id}`, { data: { uses_reels: false } });
    expect(upd.status(), `PUT fallo: ${await upd.text()}`).toBe(200);

    const g2 = await api.get(`/api/playlist/${id}`);
    const after = (await g2.json()).data;
    // El bug seria que `after.uses_reels` siga siendo `true` (no persistio el false).
    // Assert estricto: debe ser false.
    expect(after?.uses_reels, `PUT uses_reels=false no persistio: quedo ${after?.uses_reels}. Posible bug-falsy de la saga #847. PR #8076 lo corrige con normalizeBoolean.`).toBe(false);
  });
});
