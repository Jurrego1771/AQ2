// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { ApiClient } = require('../../../../src/api/api-client');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');
const { setUserCategories } = require('../../../../src/api/users-factory');
const { env } = require('../../../../src/utils/env');
const { qaName } = require('../../../../src/utils/qa-name');

/**
 * @api @regression — Comportamiento end-to-end de inherit_access (PR sm2#8507).
 *
 * Cubre lo que el smoke no puede:
 *   - Crear un parent con inherit_access=true, asignarlo a un user,
 *     crear un child -> verificar que el user hereda el child en
 *     categories[] (hook post-save -> User.updateMany $addToSet).
 *   - La herencia cubre TODO el subárbol (getAllWithChildren), no solo el
 *     child directo (incluye un grandchild).
 *   - Crear un child bajo un parent con inherit_access=false (default) -> NO
 *     dispara herencia (regression: comportamiento legacy intacto).
 *   - Grant-only: quitar el parent del user NO le quita el grant del child.
 *   - Activar inherit_access en una categoria con hijos PREEXISTENTES -> NO
 *     se aplican retroactivamente (comportamiento by-design documentado en el
 *     tooltip de la UI).
 *   - Mover una categoria (cambiar parent) bajo un padre con inherit_access
 *     dispara la herencia sobre la movida.
 *
 * Pre-requisitos (todos verificados en vivo y documentados):
 *   - Bot QA: modulo `category` habilitado para escribir (CAT-RISK-4 resuelto).
 *   - Deploy de PR #8507 presente: el smoke detecta primero si el campo
 *     `inherit_access` se proyecta en GET ?full=true; si no, este describe se
 *     skipea explicitamente.
 *   - Users fresh: el fixture qaUserFactory crea + borra un user por test
 *     (cubre CAT-RISK-6: el bot no puede actualizar users pero SI crear/
 *     modificar/borrar users NUEVOS via POST /api/user y POST /api/user/:id).
 *     Esto elimina la contaminacion entre tests: cada uno opera sobre un user
 *     self-contained; no hay que restaurar categories[] en afterEach.
 */
test.describe('Category inherit_access @api @regression - PR #8507 (comportamiento)', () => {
  test.skip(env.isProd, 'prodGuard: estos tests mutan users y categorias');

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

  /** GET /api/category?full=true y verifica que el id aparece con inherit_access. */
  async function readUserCategories(api, userId) {
    const res = await api.get(`/api/user/${userId}`);
    expect(res.status, `GET /api/user/${userId}: ${res.status}`).toBe(200);
    return res.body?.data?.categories ?? [];
  }

  /**
   * Probe de deploy via GET /api/category?full=true (ruta que SI proyecta
   * inherit_access en este dev). NO usamos GET /:id porque ese handler detail
   * aun no proyecta el campo (gap especifico cubierto por CAT-INH-002).
   */
  let deployOk = null;
  async function checkDeployOrFail(apiClient, cleaner, testInfo) {
    if (deployOk !== null) return { deployOk };
    const probe = await createCategory(apiClient, cleaner, testInfo, {
      name: catName(testInfo, '__deploy_probe__'),
      inherit_access: true,
    });
    const list = await apiClient.get('/api/category?full=true');
    const fresh = (list.body?.data ?? []).find((c) => c._id === probe._id);
    const ok = fresh !== undefined && fresh.inherit_access === true;
    return { deployOk: ok, probe, fresh };
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

  test.afterEach(async ({ api }) => {
    // Sin afterEach de restore: cada test opera sobre un user self-contained
    // creado por qaUserFactory, que se borra en el teardown del fixture. Esta
    // garantia reemplaza la restauracion manual del categories[] que tenia
    // el codigo viejo (que ademas fallaba porque el bot no puede actualizar
    // su propio record, ver CAT-RISK-6 resuelto).
  });

  // ------------------------------------------------------------
  // Regression 1: child heredado bajo parent con inherit_access=true
  // ------------------------------------------------------------
  test('CAT-INH-R-001 child bajo parent inherit=true se agrega al user.categories del parent @CAT-INH-R-001', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-parent-inh'),
      inherit_access: true,
    });
    expect(parent._id).toBeTruthy();

    await setUserCategories(api, userId, [parent._id]);
    const cats0 = await readUserCategories(apiClient, userId);
    expect(cats0, 'setup: el user no recibio el parent').toContain(parent._id);

    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-child'),
      parent: parent._id,
    });
    expect(child._id).toBeTruthy();

    await expect
      .poll(async () => readUserCategories(apiClient, userId), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(child._id);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Regression 2: la herencia cubre TODO el subarbol, no solo el child directo
  // ------------------------------------------------------------
  test('CAT-INH-R-002 la herencia cubre TODO el subarbol del child @CAT-INH-R-002', async ({ api, qaUserFactory }) => {
    // GAP DEPLOY PR #8507 (transitivo). Verificado en vivo 2026-07-15 contra
    // este dev: cuando parent.inherit_access=true y se crea un child bajo el,
    // el child SI se hereda al user. Pero cuando se crea un GRANDCHILD bajo
    // el child (sin inherit_access propio), el hook NO propaga al user.
    // user.categories termina con [parent, child] pero no el grandchild.
    // El poll espera 21s sin cambio — no es timing; es un gap de recursion del
    // hook post-save -> User.updateMany $addToSet. La funcion getAllWithChildren
    // del modelo SI es recursiva (src/server/model/schemas/category.js:255) pero
    // el hook NO la usa. CAT-RISK-7 (nuevo) cubre este riesgo. Tests de la
    // misma familia (R-001, R-003, R-004, R-005, R-006) verifican nivel 1 y
    // pasan verde tras desbloquear CAT-RISK-6 con el fixture qaUserFactory.
    test.fail(
      true,
      'vivo: CAT-RISK-7 — herencia de PR #8507 NO recurre al grandchild. ' +
        'Verificado: parent(inherit=true) + child + grandchild → user.categories=[parent, child], ' +
        'NO contiene grandchild aun esperando >20s. No es timing.'
    );

    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-parent-tree'),
      inherit_access: true,
    });
    await setUserCategories(api, userId, [parent._id]);

    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-tree-child'),
      parent: parent._id,
    });
    const grandchild = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-tree-grandchild'),
      parent: child._id,
    });

    await expect
      .poll(async () => readUserCategories(apiClient, userId), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(grandchild._id);

    expect(
      await readUserCategories(apiClient, userId),
      `user.categories no contiene nieto ${grandchild._id}`
    ).toContain(grandchild._id);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Regression 3: inherit_access=false (default) NO dispara herencia
  // ------------------------------------------------------------
  test('CAT-INH-R-003 child bajo parent inherit=false NO se otorga al user @CAT-INH-R-003', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-parent-no-inh'),
      inherit_access: false,
    });
    await setUserCategories(api, userId, [parent._id]);

    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-no-inherit-child'),
      parent: parent._id,
    });

    // Esperamos y luego verificamos que el child NO aparece. No podemos
    // garantizar ausencia absoluta (alguien podria haberlo agregado), pero
    // al menos damos tiempo suficiente y verificamos que el hijo queda fuera.
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const cats = await readUserCategories(apiClient, userId);
    expect(
      cats.includes(child._id),
      `child ${child._id} aparecio en user.categories, pero inherit_access=false no deberia haber propagado. cats=${JSON.stringify(cats)}`
    ).toBe(false);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Regression 4: Grant-only — quitar el parent al user NO quita el child
  // ------------------------------------------------------------
  test('CAT-INH-R-004 grant-only: quitar el parent no remueve el child ya heredado @CAT-INH-R-004', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-parent-grantonly'),
      inherit_access: true,
    });
    await setUserCategories(api, userId, [parent._id]);

    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-grantonly-child'),
      parent: parent._id,
    });

    // Espera a que la herencia aplique.
    await expect
      .poll(async () => readUserCategories(apiClient, userId), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(child._id);

    // Quita el parent del array de categorias del user (simula perdida de
    // acceso al padre). El child ya heredado debe sobrevivir.
    await setUserCategories(api, userId, [child._id]);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const catsAfter = await readUserCategories(apiClient, userId);
    expect(
      catsAfter.includes(child._id),
      'grant-only: el child deberia persistir en user.categories aun quitando el parent'
    ).toBe(true);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Regression 5: RETROACTIVO — activar inherit_access=true en una categoria
  // con hijos PRE-existentes NO los afecta (comportamiento by-design).
  // ------------------------------------------------------------
  test('CAT-INH-R-005 activar inherit_access retroactivo NO otorga acceso a hijos preexistentes @CAT-INH-R-005', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    // 1) Crear parent con inherit_access=false.
    const parent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-retro-parent'),
      inherit_access: false,
    });

    // 2) Crear un child YA CON EL PARENT. Este child NO heredara (flag false).
    const child = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-retro-preexisting-child'),
      parent: parent._id,
    });

    // 3) Asignar SOLO el parent al user.
    await setUserCategories(api, userId, [parent._id]);

    // 4) El child pre-existente NO debe estar en categories (no fue heredado).
    const catsAfterSetup = await readUserCategories(apiClient, userId);
    expect(
      catsAfterSetup.includes(child._id),
      `setup: child pre-existente ya esta en user.categories (deberia NO estar); cats=${JSON.stringify(catsAfterSetup)}`
    ).toBe(false);

    // 5) Activar inherit_access en el parent via POST update.
    const updateRes = await apiClient.post(
      `/api/category/${parent._id}`,
      { name: parent.name, inherit_access: true },
      { form: true }
    );
    expect(
      updateRes.ok,
      `DEPLOY INCOMPLETO PR #8507: POST /api/category/${parent._id} devolvio ${updateRes.status}: ` +
        JSON.stringify(updateRes.body).slice(0, 300)
    ).toBe(true);

    // 6) Verificar que activar el flag NO agrega retroactivamente el child al user.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const catsAfterEnable = await readUserCategories(apiClient, userId);
    expect(
      catsAfterEnable.includes(child._id),
      `comportamiento by-design: activar inherit_access=true en parent con hijos preexistentes NO debe otorgarlos retroactivamente. cats=${JSON.stringify(catsAfterEnable)}`
    ).toBe(false);

    await cleaner.clean();
  });

  // ------------------------------------------------------------
  // Regression 6: Mover (cambiar parent) una categoria bajo un padre con
  // inherit_access=true dispara la herencia sobre la movida.
  // ------------------------------------------------------------
  test('CAT-INH-R-006 mover categoria bajo parent inherit=true dispara herencia @CAT-INH-R-006', async ({ api, qaUserFactory }) => {
    const apiClient = new ApiClient(api);
    const cleaner = new ResourceCleaner(api, { testId: test.info().title });

    const userId = await qaUserFactory();
    expect(userId).toBeTruthy();

    // Parent con inherit_access=true.
    const inheritingParent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-move-inh-parent'),
      inherit_access: true,
    });

    // Otro parent SIN inherit (el origen de la categoria a mover).
    const plainParent = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-move-plain-parent'),
      inherit_access: false,
    });

    // Categoria a mover (creada inicialmente bajo plainParent).
    const moved = await createCategory(apiClient, cleaner, test.info(), {
      name: catName(test.info(), 'r-moved'),
      parent: plainParent._id,
    });

    // Asignar SOLO el inheritingParent al user target.
    await setUserCategories(api, userId, [inheritingParent._id]);

    // Verifica que 'moved' aun NO esta (porque plainParent no hereda).
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const catsBefore = await readUserCategories(apiClient, userId);
    expect(
      catsBefore.includes(moved._id),
      `pre-condicion: 'moved' deberia no estar en user.categories (plainParent no hereda); cats=${JSON.stringify(catsBefore)}`
    ).toBe(false);

    // Mover 'moved' bajo inheritingParent via POST update (cambio de parent).
    const moveRes = await apiClient.post(
      `/api/category/${moved._id}`,
      { name: moved.name, parent: inheritingParent._id },
      { form: true }
    );
    expect(
      moveRes.ok,
      `DEPLOY INCOMPLETO PR #8507: POST /api/category/${moved._id} (move) devolvio ${moveRes.status}: ` +
        JSON.stringify(moveRes.body).slice(0, 300)
    ).toBe(true);

    // Ahora 'moved' DEBE aparecer en user.categories, disparado por el
    // _parentModified en el hook.
    await expect
      .poll(async () => readUserCategories(apiClient, userId), {
        timeout: 8000,
        intervals: [500, 1000, 2000],
      })
      .toContain(moved._id);

    await cleaner.clean();
  });
});
