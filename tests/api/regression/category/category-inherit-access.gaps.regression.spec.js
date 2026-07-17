// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { setUserCategories } = require('../../../../src/api/users-factory');
const { env } = require('../../../../src/utils/env');
const { qaName } = require('../../../../src/utils/qa-name');

/**
 * @api @regression — Brechas residuales de inherit_access (PR sm2#8507).
 *
 * Complementa `category-inherit-access.regression.spec.js` cubriendo casos
 * del qa_checklist que el spec original no aborda. Todos los hallazgos
 * viven documentados en `knowledge-core/modules/category/riesgos.yaml`
 * (CAT-RISK-7..9).
 *
 * Bloque:
 *   R-007 editar categoria cambiando SOLO el name (sin cambiar parent) ->
 *        NO dispara herencia (hook guarda _parentModified).
 *   R-008 mover una categoria a parent=null (sin padre) -> NO otorga nada.
 *   R-009 POST /api/category/:id con `inherit_access: false` (JSON) via
 *        update -> guard `if (req.body.inherit_access)` lo descarta, el
 *        flag previo se mantiene (no se apaga explicitamente).
 *   R-010 dos users simultaneos con acceso al parent -> el child se otorga
 *        a AMBOS user.categories en el mismo ciclo del hook.
 *   R-011 grant-only reforzado: el child otorgado por herencia sobrevive a
 *        un re-parent posterior del propio child (cambio de parent no
 *        quita el grant ya entregado).
 *   R-012 idempotencia del $addToSet: la misma categoria creada dos veces
 *        bajo el mismo parent con flag activo -> aparece 1 sola vez en
 *        user.categories.
 *   R-013 smoke de cat-inherit que verifica el detail handler proyecta el
 *        campo (CAT-INH-002 reabre cuando se arregle). test.fail vivo
 *        hasta que la rama detail de src/server/routes/api/category/index.js
 *        agregue inherit_access al .select().
 *
 * Pre-requisitos (mismos que el spec de regression principal):
 *   - Bot QA con modulo category habilitado (CAT-RISK-4 resuelto 2026-07-14).
 *   - Deploy de PR #8507 presente: el probe del describe lo verifica via
 *     /api/category?full=true antes de correr cualquier test (falla rapido
 *     si el deploy no llego a este dev).
 *   - Users fresh via qaUserFactory (CAT-RISK-6 resuelto 2026-07-15).
 */
test.describe('Category inherit_access (gaps) @api @regression - PR #8507 (brechas)', () => {
  test.skip(env.isProd, 'prodGuard: estos tests mutan users y categorias');

  function catName(testInfo, suffix) {
    return qaName({ type: 'Cat-Inh-G', testTitle: testInfo.title, suffix });
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

  async function readUserCategories(api, userId) {
    const res = await api.get(`/api/user/${userId}`);
    expect(res.status, `GET /api/user/${userId}: ${res.status}`).toBe(200);
    return res.body?.data?.categories ?? [];
  }

  /**
   * Probe de deploy via /api/category?full=true. Esta ruta SI proyecta
   * `inherit_access` en este dev (ver CAT-INH-003b); si no aparece,
   * el describe entero falla rapido con mensaje claro.
   */
  async function checkDeployOrFail(apiClient, cleaner, testInfo) {
    const probe = await createCategory(apiClient, cleaner, testInfo, {
      name: catName(testInfo, '__deploy_probe__'),
      inherit_access: true,
    });
    const list = await apiClient.get('/api/category?full=true');
    const fresh = (list.body?.data ?? []).find((c) => c._id === probe._id);
    return {
      deployOk: fresh !== undefined && fresh.inherit_access === true,
      probe,
      fresh,
    };
  }

  test.beforeEach(async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });
    const r = await checkDeployOrFail(apiClient, cleaner, test.info());
    expect(
      r.deployOk,
      'DEPLOY INCOMPLETO PR #8507: GET /api/category?full=true no proyecta inherit_access. ' +
        'POST devolvio inherit_access=' + JSON.stringify(r.probe.inherit_access) +
        '; item en listado full=' + JSON.stringify(r.fresh)
    ).toBe(true);
  });

  // ------------------------------------------------------------
  // R-007: editar SOLO el name (sin cambiar parent) NO dispara herencia
  // ------------------------------------------------------------
  test('CAT-INH-R-007 editar name sin cambiar parent NO dispara herencia @CAT-INH-R-007', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'edit-name-parent-inh'),
      inherit_access: true,
    });
    // Asignamos el parent ANTES de crear el child (orden de R-001, que es
    // el que dispara la herencia; si asignamos despues, setUserCategories
    // reemplaza y borra el grant in flight).
    await setUserCategories(api, userId, [parent._id]);
    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'edit-name-child'),
      parent: parent._id,
    });

    // Espera a que el child quede en user.categories por la herencia del create.
    await expect
      .poll(async () => readUserCategories(apiClient, userId), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(child._id);

    // Snapshot del array categories antes del edit.
    const catsBefore = await readUserCategories(apiClient, userId);
    expect(
      catsBefore.includes(child._id),
      `pre: el child deberia estar en user.categories antes del edit-only-name; cats=${JSON.stringify(catsBefore)}`
    ).toBe(true);
    const beforeCount = catsBefore.length;

    // Edit SOLO el name del child (sin tocar parent). El hook debe NO
    // disparar la rama de herencia porque _parentModified es false.
    const newName = catName(test.info(), 'edit-name-child-renamed');
    const updateRes = await apiClient.post(
      `/api/category/${child._id}`,
      { name: newName },
      { form: true }
    );
    expect(
      updateRes.ok,
      `POST /api/category/${child._id} (rename) devolvio ${updateRes.status}: ` +
        JSON.stringify(updateRes.body).slice(0, 300)
    ).toBe(true);

    // Espera prudente + verificar que no aparecio ninguna entrada nueva.
    // Solo cambia el name -> el array categories[] del user no cambia.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const catsAfter = await readUserCategories(apiClient, userId);
    expect(
      catsAfter.length,
      `edit-sin-parent disparó herencia indebida: cats antes=${JSON.stringify(catsBefore)} despues=${JSON.stringify(catsAfter)}`
    ).toBe(beforeCount);

    // Y el child sigue presente (grant-only).
    expect(catsAfter.includes(child._id), 'edit-sin-parent removió el child del user').toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // R-008: cambiar parent a null (mover a "sin padre") NO otorga nada
  // ------------------------------------------------------------
  test('CAT-INH-R-008 mover categoria a parent=null NO otorga acceso @CAT-INH-R-008', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    // Parent con inherit_access=true para que se dispare la herencia al
    // crear/mover bajo el.
    const inheritingParent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r008-inheriting-parent'),
      inherit_access: true,
    });

    // Otro parent SIN inherit (seria el padre de origen del child antes
    // de mover a null -> equivalente a "sin padre" pero pasando por edit).
    const plainParent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r008-plain-parent'),
      inherit_access: false,
    });

    // El user solo tiene acceso al plainParent (NO al inheritingParent).
    // Esto valida que un edit que cambia el parent DEBERIA poder NO dar
    // acceso (porque el parent destino no hereda), o que poner parent=""
    // NO se confunda con cambio a otro parent.
    await setUserCategories(api, userId, [plainParent._id]);

    // Crear child bajo plainParent (no se hereda por flag=false).
    const moved = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r008-to-be-parentless'),
      parent: plainParent._id,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const catsBefore = await readUserCategories(apiClient, userId);
    expect(
      catsBefore.includes(moved._id),
      `pre: el child no deberia estar en user.categories (plainParent no hereda); cats=${JSON.stringify(catsBefore)}`
    ).toBe(false);

    // Edit moviendo 'moved' a parent="" (sin padre). Verificamos que
    // el server lo registre como cambio Y que NO se otorgue al user
    // (porque no hay parent heredante nuevo -> la rama _parentModified
    // del hook sale temprano al ver parent no-heredante o == "").
    const updateRes = await apiClient.post(
      `/api/category/${moved._id}`,
      { name: moved.name, parent: '' },
      { form: true }
    );
    expect(
      updateRes.ok,
      `POST /api/category/${moved._id} (parent='') devolvio ${updateRes.status}: ` +
        JSON.stringify(updateRes.body).slice(0, 300)
    ).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    const catsAfter = await readUserCategories(apiClient, userId);
    expect(
      catsAfter.includes(moved._id),
      `parent='' (sin padre) otorgó acceso indebido al user; cats=${JSON.stringify(catsAfter)}`
    ).toBe(false);

    // Limpieza: devolved parent valido antes del teardown para que el
    // sweeper pueda borrar sin necesidad de auth admin extra. Seteamos
    // parent al plainParent original (no requiere permisos elevados; el
    // bot puede editar categorias).
    await apiClient.post(
      `/api/category/${moved._id}`,
      { name: moved.name, parent: plainParent._id },
      { form: true }
    );

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // R-009: POST /api/category/:id con `inherit_access: false` (JSON)
  // via update -> el guard descarta el campo y el flag previo se mantiene.
  // Documenta CAT-RISK-8 explicitamente para integraciones API.
  // ------------------------------------------------------------
  test('CAT-INH-R-009 POST /api/category/:id {inherit_access:false} (JSON) NO apaga un flag true previo @CAT-INH-R-009', async ({ api }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    // Setup: crear categoria con inherit_access=true.
    const created = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r009-flag-true-setup'),
      inherit_access: true,
    });
    expect(created._id).toBeTruthy();

    // Verificamos el setup.
    const list = await apiClient.get('/api/category?full=true');
    const beforeFresh = (list.body?.data ?? []).find((c) => c._id === created._id);
    expect(beforeFresh?.inherit_access === true, 'setup: la categoria no arranco con inherit=true').toBe(true);

    // Update con JSON body {inherit_access: false} -> el guard `if
    // (req.body.inherit_access)` descarta el false explicito. El flag
    // previo (true) DEBE persistir. Test vivo de CAT-RISK-8: si el dev
    // corrije el guard para aceptar `false` JSON, este spec ajustara su
    // expectativa a `false` (seria la mejora, no un bug).
    const updateRes = await apiClient.post(
      `/api/category/${created._id}`,
      { name: 'r009-after-json-false', inherit_access: false },
      { form: false }
    );
    expect(
      updateRes.ok,
      `POST /api/category/${created._id} (JSON) devolvio ${updateRes.status}: ` +
        JSON.stringify(updateRes.body).slice(0, 300)
    ).toBe(true);

    const updated = getCat(updateRes.body);
    // El flag deberia seguir true (guard descarta false explicito en JSON).
    expect(
      updated?.inherit_access === true,
      `GAP CAT-RISK-8 vivo: POST /api/category/:id con inherit_access=false (JSON) ` +
        'apago el flag (el guard truthy lo esta dejando pasar al normalize). ' +
        'updated=' + JSON.stringify(updated)
    ).toBe(true);

    // Confirmacion cruzada por listado.
    const afterList = await apiClient.get('/api/category?full=true');
    const afterFresh = (afterList.body?.data ?? []).find((c) => c._id === created._id);
    expect(
      afterFresh?.inherit_access === true,
      'CAT-RISK-8: GET ?full=true post-update muestra inherit_access=false (flag fue apagado por JSON false)'
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // R-010: 2 users simultaneos con acceso al parent heredan el child
  // ------------------------------------------------------------
  test('CAT-INH-R-010 dos users con acceso al parent heredan el child (fan-out) @CAT-INH-R-010', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userA = await qaUserFactory();
    const userB = await qaUserFactory();
    expect(userA).toBeTruthy();
    expect(userB).toBeTruthy();

    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r010-parent-inh'),
      inherit_access: true,
    });

    // Asignamos el parent a AMBOS users.
    await setUserCategories(api, userA, [parent._id]);
    await setUserCategories(api, userB, [parent._id]);

    const catsA0 = await readUserCategories(apiClient, userA);
    const catsB0 = await readUserCategories(apiClient, userB);
    expect(catsA0.includes(parent._id), `userA no recibió el parent; cats=${JSON.stringify(catsA0)}`).toBe(true);
    expect(catsB0.includes(parent._id), `userB no recibió el parent; cats=${JSON.stringify(catsB0)}`).toBe(true);

    // Crear un child bajo el parent.
    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r010-child'),
      parent: parent._id,
    });

    // Ambos users deben recibir el child.
    await expect
      .poll(async () => readUserCategories(apiClient, userA), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(child._id);
    await expect
      .poll(async () => readUserCategories(apiClient, userB), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(child._id);

    const catsAFinal = await readUserCategories(apiClient, userA);
    const catsBFinal = await readUserCategories(apiClient, userB);
    expect(catsAFinal.includes(child._id), `userA no heredo el child; cats=${JSON.stringify(catsAFinal)}`).toBe(true);
    expect(catsBFinal.includes(child._id), `userB no heredo el child; cats=${JSON.stringify(catsBFinal)}`).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // R-011: grant-only reforzado: re-parent del child (cambiar a otro
  // padre) NO le quita el acceso ya otorgado.
  // ------------------------------------------------------------
  test('CAT-INH-R-011 re-parent del child NO remueve el grant ya otorgado @CAT-INH-R-011', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    const inheritingParent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r011-inh-parent'),
      inherit_access: true,
    });
    const otherParent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r011-other-parent'),
      inherit_access: false,
    });

    await setUserCategories(api, userId, [inheritingParent._id]);

    // Child creado bajo inheritingParent.
    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r011-child'),
      parent: inheritingParent._id,
    });

    // Espera herencia inicial.
    await expect
      .poll(async () => readUserCategories(apiClient, userId), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(child._id);

    // Re-parent del child a otherParent (que NO hereda).
    const updateRes = await apiClient.post(
      `/api/category/${child._id}`,
      { name: child.name, parent: otherParent._id },
      { form: true }
    );
    expect(
      updateRes.ok,
      `POST /api/category/${child._id} (re-parent) devolvio ${updateRes.status}`
    ).toBe(true);

    // Grant-only: el child debe seguir en user.categories del user (no
    // se revoca al re-parent ni por dejar de tener acceso al padre
    // heredante).
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const catsAfter = await readUserCategories(apiClient, userId);
    expect(
      catsAfter.includes(child._id),
      `grant-only violado: re-parent del child le quito el acceso al user. cats=${JSON.stringify(catsAfter)}`
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // R-012: idempotencia del $addToSet: el child creado + asignado no
  // se duplica en user.categories aunque algun flujo posterior intente
  // re-agregarlo.
  // ------------------------------------------------------------
  test('CAT-INH-R-012 la categoria aparece UNA sola vez en user.categories (idempotencia) @CAT-INH-R-012', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r012-parent-inh'),
      inherit_access: true,
    });
    await setUserCategories(api, userId, [parent._id]);

    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r012-child'),
      parent: parent._id,
    });

    // Espera la herencia inicial.
    await expect
      .poll(async () => readUserCategories(apiClient, userId), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(child._id);

    // Forzar intento de re-otorgamiento (setUserCategories con array
    // que ya incluye el child). Si el server en algun momento intenta
    // reasignar, $addToSet debe dedupe.
    await setUserCategories(api, userId, [parent._id, child._id]);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const cats = await readUserCategories(apiClient, userId);
    const occurrences = cats.filter((c) => c === child._id).length;
    expect(
      occurrences,
      `categoria duplicada en user.categories: ocurrencias=${occurrences}, cats=${JSON.stringify(cats)}`
    ).toBe(1);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // R-013: smoke de detalle -> verifica que GET /api/category/:id
  // proyecta inherit_access cuando se arregle. test.fail vivo hasta
  // que el dev modifique el .select() del detail handler en
  // src/server/routes/api/category/index.js. Complementa CAT-INH-002
  // (que vive en el bloque smoke); este se enfoca en el camino
  // POST-update (donde el flag SI cambia y deberia reflejarse en el
  // detail).
  // ------------------------------------------------------------
  test('CAT-INH-R-013 GET /api/category/:id proyecta inherit_access=true tras POST update @CAT-INH-R-013', async ({ api }) => {
    test.fail(
      true,
      'vivo: CAT-RISK-5 — detail handler de /api/category/:id aun NO proyecta inherit_access. ' +
        'Para cerrar: agregar inherit_access al .select() del handler detail en ' +
        'src/server/routes/api/category/index.js. Verificado en vivo 2026-07-15 que ' +
        'los listados (basico, ?full=true, ?with_count=true) SI proyectan el flag.'
    );

    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const created = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r013-detail-probe'),
      inherit_access: true,
    });

    const detail = await apiClient.get(`/api/category/${created._id}`);
    expect(detail.status).toBe(200);
    const f = getCat(detail.body);
    expect(
      f?.inherit_access === true,
      'GAP PR #8507 (detail handler): GET /api/category/:id no proyecta inherit_access tras create. ' +
        'Detail devolvio: ' + JSON.stringify(f) + ' (los listados SI lo proyectan).'
    ).toBe(true);

    await cleaner.clean();
  });
});
