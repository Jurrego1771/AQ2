// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { env } = require('../../../../src/utils/env');
const { qaName } = require('../../../../src/utils/qa-name');

/**
 * @api @smoke — Herencia de acceso a subcategorías (PR sm2#8507).
 *
 * Cubre el contrato y la persistencia del flag `inherit_access`. NO skipeamos
 * si el deploy no esta: los specs FALLAN con mensaje claro. La idea es que el
 * primer verde se observe cuando el equipo confirme el deploy; hasta entonces,
 * los rojos son se;al honesta de "feature no expuesta en este dev".
 *
 * Bloque:
 *   1) POST sin `inherit_access` -> default false/ausente.
 *   2) POST con `inherit_access=true` -> persiste; GET by id lo expone.
 *   3) GET listado (basico, ?full, ?with_count) proyecta el campo en items
 *      frescos.
 *   4) POST /api/category/:id acepta y edita inherit_access; GET by id lo
 *      confirma.
 *   5) POST /api/category/:id solo con name NO resetea el flag previo.
 *
 * El sub-bloque end-to-end (user.categories[]) vive en
 * tests/api/regression/category/category-inherit-access.regression.spec.js.
 */
test.describe('Category inherit_access @api @smoke - PR #8507 (contrato y persistencia)', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  function catName(testInfo, suffix) {
    return qaName({ type: 'Cat-Inh', testTitle: testInfo.title, suffix });
  }

  function getCat(body) {
    const raw = body?.data ?? body;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  async function createCategory(client, cleaner, testInfo, overrides = {}) {
    const payload = {
      name: catName(testInfo, 'base'),
      drm: 'deny',
      track: true,
      visible: true,
      ...overrides,
    };
    const res = await client.post('/api/category', payload, { form: true });
    if (!res.ok) {
      throw new Error(
        `createCategory fallo: status=${res.status} body=${JSON.stringify(res.body).slice(0, 300)}`
      );
    }
    const created = getCat(res.body);
    if (created?._id) cleaner.register('category', created._id);
    return created;
  }

  /**
   * Crea una categoria con inherit_access=true. Verifica el flag en el body
   * del POST y en el listado ?full=true (rutas que SI proyectan el flag en
   * este dev). NO usamos GET /:id como ground-truth aqui porque ese handler
   * detail aun no proyecta inherit_access (gap especifico, ver CAT-INH-002).
   */
  async function probeInheritAccessRoundtrip(apiClient, cleaner, testInfo, suffix) {
    const created = await createCategory(apiClient, cleaner, testInfo, {
      name: catName(testInfo, suffix),
      inherit_access: true,
    });
    const list = await apiClient.get('/api/category?full=true');
    const fresh = (list.body?.data ?? []).find((c) => c._id === created._id);
    return {
      created,
      fresh,
      deployed: fresh !== undefined && fresh.inherit_access === true,
    };
  }

  // ------------------------------------------------------------
  // Smoke 1: POST sin inherit_access -> default false/ausente (legacy intacto)
  // ------------------------------------------------------------
  test('CAT-INH-001 POST sin inherit_access persiste default false/ausente @CAT-INH-001', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const res = await apiClient.post(
      '/api/category',
      { name: catName(test.info(), 'default-false') },
      { form: true }
    );
    expect(res.status, `POST /api/category: ${res.status}`).toBe(200);
    const created = getCat(res.body);
    expect(created?._id, 'POST no devolvio _id').toBeTruthy();
    if (created?._id) cleaner.register('category', created._id);

    expect(
      created.inherit_access === undefined || created.inherit_access === false,
      `inherit_access no es default: ${JSON.stringify(created.inherit_access)}`
    ).toBe(true);

    // Relee por GET by id.
    const fetched = await apiClient.get(`/api/category/${created._id}`);
    expect(fetched.status).toBe(200);
    const f = getCat(fetched.body);
    expect(
      f.inherit_access === undefined || f.inherit_access === false,
      `GET by id devolvio inherit_access no default: ${JSON.stringify(f.inherit_access)}`
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Smoke 2: POST con inherit_access=true -> persiste; GET by id lo expone
  // ------------------------------------------------------------
  test('CAT-INH-002 GET /api/category/:id proyecta inherit_access @CAT-INH-002', async ({ api }) => {
    // Este test apunta especificamente al handler detail. Verificado en vivo
    // 2026-07-14: el detail SOLO devuelve {_id, name, slug} aunque el resto
    // del modulo ya proyecta inherit_access (basic, ?full=true, ?with_count).
    // Hasta que se actualice src/server/routes/api/category/index.js (detail)
    // para incluir inherit_access en el .select(), queda rojo.
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const created = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'detail-probe'),
      inherit_access: true,
    });

    const detail = await apiClient.get(`/api/category/${created._id}`);
    expect(detail.status).toBe(200);
    const f = getCat(detail.body);
    expect(
      f?.inherit_access === true,
      'GAP PR #8507 (detail handler): GET /api/category/:id no proyecta inherit_access. ' +
        'Detail devolvio: ' + JSON.stringify(f) + '. El fix llega a listados pero no al detail handler.'
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Smoke 3: GET listado (basico, ?full, ?with_count) proyecta inherit_access
  // en items RECIEN CREADOS (las categorias viejas en Mongo no lo tienen).
  // ------------------------------------------------------------
  async function freshCategoryProjectsField(apiClient, query, testInfo, cleaner, label) {
    const created = await createCategory(apiClient, cleaner, testInfo, {
      name: catName(testInfo, `field-probe-${label}`),
    });
    const url = query ? `/api/category?${query}` : '/api/category';
    const res = await apiClient.get(url);
    expect(res.status, `GET ${url}: ${res.status}`).toBe(200);
    const items = res.body?.data ?? [];
    const found = items.find((c) => c._id === created._id);
    const projects = found !== undefined && 'inherit_access' in found;
    return { created, found, projects };
  }

  test('CAT-INH-003 GET /api/category (basico) proyecta inherit_access sobre item fresco @CAT-INH-003', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const r = await freshCategoryProjectsField(apiClient, '', test.info(), cleaner, 'basic');
    expect(
      r.projects,
      `DEPLOY INCOMPLETO PR #8507: categoria fresca ${r.created._id} no proyecta inherit_access en /api/category (basico). ` +
        'Item devuelto: ' + JSON.stringify(r.found)
    ).toBe(true);
    await cleaner.clean();
  });

  test('CAT-INH-003b GET /api/category?full=true proyecta inherit_access sobre item fresco @CAT-INH-003b', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const r = await freshCategoryProjectsField(apiClient, 'full=true', test.info(), cleaner, 'full');
    expect(
      r.projects,
      `DEPLOY INCOMPLETO PR #8507: categoria fresca no proyecta inherit_access en /api/category?full=true. ` +
        'Item devuelto: ' + JSON.stringify(r.found)
    ).toBe(true);
    await cleaner.clean();
  });

  test('CAT-INH-003c GET /api/category?with_count=true proyecta inherit_access sobre item fresco @CAT-INH-003c', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const r = await freshCategoryProjectsField(apiClient, 'with_count=true', test.info(), cleaner, 'with_count');
    expect(
      r.projects,
      `DEPLOY INCOMPLETO PR #8507: categoria fresca no proyecta inherit_access en /api/category?with_count=true. ` +
        'Item devuelto: ' + JSON.stringify(r.found)
    ).toBe(true);
    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Smoke 4: edita inherit_access via POST /api/category/:id
  // ------------------------------------------------------------
  test('CAT-INH-004 POST /api/category/:id cambia inherit_access false->true (body del POST lo confirma) @CAT-INH-004', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const created = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'will-edit'),
    });
    expect(created._id).toBeTruthy();

    const postRes = await apiClient.post(
      `/api/category/${created._id}`,
      { name: 'rename-edit-test', inherit_access: true },
      { form: true }
    );
    expect(
      postRes.ok,
      `POST /api/category/${created._id} devolvio ${postRes.status}: ` +
        JSON.stringify(postRes.body).slice(0, 300)
    ).toBe(true);

    // La respuesta del POST trae la categoria actualizada. Validamos el flag
    // ahi (no en GET by id porque ese detail handler es el unico path que
    // aun no proyecta inherit_access — ver CAT-INH-002).
    const updated = getCat(postRes.body);
    expect(
      updated?.inherit_access === true,
      'POST /api/category/:id no devolvio inherit_access=true en su body. Body: ' +
        JSON.stringify(postRes.body).slice(0, 400)
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Smoke 5: POST /:id sin inherit_access conserva el flag previo (back-compat)
  // ------------------------------------------------------------
  test('CAT-INH-005 POST /api/category/:id solo con name conserva inherit_access=true previo @CAT-INH-005', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    // Setup: creamos con inherit_access=true y validamos en el listado ?full=true.
    const probe = await probeInheritAccessRoundtrip(apiClient, cleaner, test.info(), 'keep-true');
    expect(
      probe.deployed,
      'GAP setup: ni siquiera el listado ?full=true proyecta inherit_access; el fix no llega a este dev.'
    ).toBe(true);

    // POST solo cambia el name; NO envia inherit_access. El servidor solo
    // sobreescribe si viene en el body (create.js:31-33), asi que el flag
    // previo debe sobrevivir.
    const newName = 'rename-keep-true';
    const postRes = await apiClient.post(
      `/api/category/${probe.created._id}`,
      { name: newName },
      { form: true }
    );
    expect(postRes.ok, `POST /api/category/:id: ${postRes.status}`).toBe(true);

    const updated = getCat(postRes.body);
    expect(
      updated?.inherit_access === true,
      `POST solo con name deberia haber dejado inherit_access=true; got inherit_access=${JSON.stringify(updated?.inherit_access)}`
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Smoke 6: POST /api/category con `inherit_access: false` (JSON) NO
  // procesa el campo por el guard `if (req.body.inherit_access)` documentado
  // en CAT-RISK-8. JSON body con boolean false explicito queda fuera del
  // guard; el server conserva el valor previo (undefined al crear). Valida
  // el contrato real de la API para integraciones externas (no UI).
  // ------------------------------------------------------------
  test('CAT-INH-006 POST /api/category {inherit_access:false} (JSON) no activa el flag @CAT-INH-006', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const payload = {
      name: catName(test.info(), 'json-false-probe'),
      inherit_access: false,
    };
    const res = await apiClient.post('/api/category', payload, { form: false });
    expect(res.status, `POST /api/category: ${res.status}`).toBe(200);
    const created = getCat(res.body);
    expect(created?._id, 'POST no devolvio _id').toBeTruthy();
    if (created?._id) cleaner.register('category', created._id);

    // El guard `if (req.body.inherit_access)` descarta `false` explicito en
    // JSON. El server crea la categoria sin tocar inherit_access (queda false
    // por default del schema). Verificamos que NO queda `true` (no se
    // invirtio) y que el GET listado ?full=true muestra el default.
    expect(
      created.inherit_access !== true,
      `GAP CAT-RISK-8: POST con inherit_access=false (JSON) activo el flag a true. ` +
        'created=' + JSON.stringify(created)
    ).toBe(true);

    const list = await apiClient.get('/api/category?full=true');
    const fresh = (list.body?.data ?? []).find((c) => c._id === created._id);
    expect(fresh, 'item recien creado no aparece en listado ?full=true').toBeTruthy();
    expect(
      fresh?.inherit_access !== true,
      `GAP CAT-RISK-8: GET ?full=true refleja inherit_access=true tras POST JSON false. ` +
        'fresh=' + JSON.stringify(fresh)
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Smoke 7: POST /api/category con `inherit_access: 'false'` (string en
  // form-encoding) SI entra al guard (string truthy) y se normaliza a
  // false. Este caso es el de la UI actual (form-encoded por defecto en
  // el client .coffee): vale verificar que explicito `false` (string) se
  // respeta y la categoria queda con inherit_access=false/ausente.
  // ------------------------------------------------------------
  test('CAT-INH-007 POST /api/category {inherit_access:"false"} (form) NO activa el flag @CAT-INH-007', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const payload = {
      name: catName(test.info(), 'form-string-false-probe'),
      inherit_access: 'false',
    };
    const res = await apiClient.post('/api/category', payload, { form: true });
    expect(res.status, `POST /api/category: ${res.status}`).toBe(200);
    const created = getCat(res.body);
    expect(created?._id, 'POST no devolvio _id').toBeTruthy();
    if (created?._id) cleaner.register('category', created._id);

    // Con form-encoding el string 'false' es truthy -> normalizeBoolean lo
    // convierte a false. El category queda con inherit_access=false.
    expect(
      created.inherit_access !== true,
      `POST form-encoded {inherit_access:'false'} activo el flag a true (bug). ` +
        'created=' + JSON.stringify(created)
    ).toBe(true);

    await cleaner.clean();
  });
});
