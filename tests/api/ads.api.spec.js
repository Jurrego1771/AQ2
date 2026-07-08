// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * @api — Contrato del recurso Ad (sm2 vista ads.coffee / ad.coffee).
 * Mapea el contrato HTTP verificado contra src/server/routes/api/ad/* de sm2.
 * - Listado: GET /api/ad (con count=true para total; default limit=11, status=0).
 * - Detalle: GET /api/ad/:ad_id (404 NOT_FOUND si id invalido / no existe).
 * - Alta:    POST /api/ad/ (jsonp {status, data}).
 * - Update:  POST /api/ad/:ad_id (NO es PUT; contrato sm2).
 * - Delete:  DELETE /api/ad/:ad_id.
 *
 * Pruebas vivas ADS-TC-14..15 son rojo-esperado hasta que se arreglen bugs
 * encontrados en vivo: typo `gdai` en update.js (RISK-2) y estado leak entre
 * tipos al update (RISK-5).
 */
test.describe('Ads API @api', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  test('GET /api/:id devuelve 200 para un ad existente con _id, name, type @ADS-TC-11', async ({ ad, adsClient }) => {
    const res = await adsClient.getById(ad);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'OK');
    expect(body.data).toHaveProperty('_id', ad);
    expect(body.data).toHaveProperty('name');
    expect(['vast', 'vmap', 'local', 'ad-insertion', 'ad-insertion-google', 'ad-prebid', 'googleima', 'adswizz'])
      .toContain(body.data.type);
  });

  test('GET /api/:id responde 404 con NOT_FOUND para id valido pero inexistente @ADS-TC-12', async ({ adsClient }) => {
    // ObjectId valido (24 hex chars) que no existe en la cuenta.
    const fakeId = '000000000000000000000000';
    const res = await adsClient.getById(fakeId);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.data).toBe('NOT_FOUND');
  });

  test('GET /api/listado con count=true devuelve la estructura del contador @ADS-TC-13', async ({ adsClient }) => {
    const res = await adsClient.count();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'OK');
    expect(typeof body.data).toBe('number');
    expect(body.data).toBeGreaterThan(0);
  });

  test('UPDATE con cambio de tipo a vast debe limpiar google_dai (typo `gdai` en update.js) @ADS-TC-14', async ({ ad, adsClient, api }) => {
    // Comportamiento esperado (a proteger): al cambiar de tipo, los campos
    // del tipo anterior deben quedar nullificados. Hoy NO se cumple por el
    // typo `ad.gdai = null` en update.js (rama vast, deberia ser `ad.google_dai = null`)
    // -> tracked en Jurrego1771/AQ2#44 (ADS-RISK-4). Test en rojo hasta fix.

    // Paso 1: crear Ad ad-insertion-google con source_id y hmac reales.
    const created = await adsClient.create({
      name: `[QA-AUTO] Ad GDAI ${Date.now()}`,
      type: 'ad-insertion-google',
      is_enabled: 'false',
      gdai: { sourceId: 'TEST_SOURCE_ID_QAXSS', hmac: 'TEST_HMAC_QAXSS' },
    });
    expect(created.status()).toBe(200);
    const adData = (await created.json()).data;
    const adId = adData._id;
    expect(adId).toBeTruthy();

    try {
      // Paso 2: cambiar el tipo a vast via update.
      const updated = await adsClient.update(adId, {
        name: adData.name,
        type: 'vast',
        is_enabled: 'false',
        schedule: { pre: { tag: 'https://example.com/preroll.xml' }, post: { tag: '' }, mid: [] },
      });
      expect(updated.status()).toBe(200);

      // Paso 3: releer y comprobar que google_dai fue nullificado.
      const got = await adsClient.getById(adId);
      const after = (await got.json()).data;
      // Esperado: google_dai deberia estar limpio tras el cambio de tipo.
      expect(after.google_dai == null
        || (after.google_dai && after.google_dai.source_id == null)
      ).toBe(true);
    } finally {
      await api.delete(`/api/ad/${adId}`);
    }
  });

  test('Cambiar el Type de un Ad a ad-prebid debe limpiar campos de tipos anteriores @ADS-TC-15', async ({ ad, adsClient, api }) => {
    // Comportamiento esperado (a proteger): un PUT (POST en sm2) que cambia
    // el type debe limpiar campos del type previo (insertion, google_dai,
    // vmap, adswizz). Hoy la rama `ad-prebid` de update.js NO limpia nada
    // -> tracked en Jurrego1771/AQ2#44 (ADS-RISK-4). Test en rojo hasta fix.

    // Paso 1: crear Ad ad-insertion (necesita loop=null es OK).
    const create = await adsClient.create({
      name: `[QA-AUTO] Ad Insertion ${Date.now()}`,
      type: 'ad-insertion',
      is_enabled: 'false',
      insertion: { tag: '', loop: null },
    });
    expect(create.status()).toBe(200);
    const insert = (await create.json()).data;
    const insertId = insert._id;

    try {
      // Paso 2: cambiar tipo a ad-prebid via update.
      const update = await adsClient.update(insertId, {
        name: insert.name,
        type: 'ad-prebid',
        is_enabled: 'false',
        prebid: { type: 'appnexus', unitCode: 'TEST_UNIT' },
      });
      expect(update.status()).toBe(200);

      // Paso 3: releer y comprobar que `insertion` se nullifico.
      const get = await adsClient.getById(insertId);
      const after = (await get.json()).data;
      expect(after.insertion == null).toBe(true);
    } finally {
      await api.delete(`/api/ad/${insertId}`);
    }
  });

  test('Vaciar pausead.position con "" debe persistir limpio @ADS-TC-16', async ({ ad, adsClient, api }) => {
    // Comportamiento esperado (a proteger): enviar empty string en cualquier
    // campo editable debe significar "dejar en blanco". Hoy la guarda
    // `if (pauseadPosition && trim(X) !== '')` en update.js salta el bloque
    // para X='' -> tracked en Jurrego1771/AQ2#47 (ADS-RISK-9). Misma familia
    // que LIVE-RISK-7. Test en rojo hasta fix.

    // Creamos un VAST con position.
    const c = await adsClient.create({
      name: `[QA-AUTO] Ad PauseAd Pos ${Date.now()}`,
      type: 'vast',
      is_enabled: 'false',
      schedule: {
        pre: { tag: '' }, post: { tag: '' }, mid: [],
        pausead: { position: 'top-left', close_button: 5 },
      },
    });
    expect(c.status()).toBe(200);
    const a = (await c.json()).data;
    const id = a._id;
    try {
      // Update position a '' (vacio).
      const u = await adsClient.update(id, {
        name: a.name, type: 'vast', is_enabled: 'false',
        schedule: { pre: { tag: '' }, post: { tag: '' }, mid: [], pausead: { position: '' } },
      });
      expect(u.status()).toBe(200);

      // Releer y comprobar que position fue nullificada.
      const got = await adsClient.getById(id);
      const after = (await got.json()).data;
      expect(after.schedule?.pausead?.position == null).toBe(true);
    } finally {
      await api.delete(`/api/ad/${id}`);
    }
  });

  test('Vaciar schedule.mid con [] debe persistir limpio @ADS-TC-17', async ({ ad, adsClient, api }) => {
    // Comportamiento esperado (a proteger): enviar `mid: []` debe vaciar el
    // array. Hoy update.js solo limpia mid si el body trae el literal 'null'
    // (string) -> tracked en Jurrego1771/AQ2#47 (ADS-RISK-9). Test en rojo
    // hasta fix.

    // Crear Ad VAST con un mid poblado.
    const c = await adsClient.create({
      name: `[QA-AUTO] Ad Mid ${Date.now()}`,
      type: 'vast',
      is_enabled: 'false',
      schedule: {
        pre: { tag: '' }, post: { tag: '' },
        mid: [{ tag: 'https://example.com/mid.xml', position: '5' }],
      },
    });
    expect(c.status()).toBe(200);
    const a = (await c.json()).data;
    const id = a._id;
    try {
      // Update mid = [] (empty array, semantica natural de "vaciar").
      const u = await adsClient.update(id, {
        name: a.name, type: 'vast', is_enabled: 'false',
        schedule: { pre: { tag: '' }, post: { tag: '' }, mid: [] },
      });
      expect(u.status()).toBe(200);

      // Releer y comprobar que mid quedo vacio.
      const got = await adsClient.getById(id);
      const after = (await got.json()).data;
      expect(Array.isArray(after.schedule?.mid) && after.schedule.mid.length === 0).toBe(true);
    } finally {
      await api.delete(`/api/ad/${id}`);
    }
  });
});
