// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');

/**
 * @api @token — Scope read/write de los API tokens de cuenta (US-036).
 *
 * Complementa el módulo token-profiles (gate por perfil, TOK-TC-001..004, bloqueado
 * por permisos de plataforma). Aquí SÍ es explorable: el campo `access` (read/write)
 * del form /settings/api no está gateado por is_admin. La cuenta QA puede crear,
 * usar y borrar sus propios tokens self-contained (delete habilitado 2026-07-14).
 *
 * Auth: la gestión de tokens (/api/account/token) va por SESIÓN (fixture `api`,
 * storageState). El consumo de recursos va por header X-API-TOKEN (contexto aparte,
 * SIN cookies — si hay sesión el server ignora el token, ver overview.md).
 *
 * VERIFICADO EN VIVO 2026-07-14: read-only rechaza escrituras (403), deleted/disabled
 * dejan de autenticar al instante. test.fail vivo: TOK-TC-011 (POST /api/show con
 * token read devuelve 500 en vez de 403 — bug de manejo de error, ver Jurrego1771/AQ2).
 */
test.describe('API Tokens — scope read/write @api @token', () => {
  test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');

  /** @type {string[]} valores de token creados por el test actual, a limpiar. */
  let created;
  test.beforeEach(() => { created = []; });
  test.afterEach(async ({ api }) => {
    for (const tok of created) await api.delete(`/api/account/token/${tok}`).catch(() => {});
  });

  const uniqueDesc = (label) =>
    `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  /**
   * Crea un token por sesión y devuelve su documento (con `.token` y `.access`).
   * @param {import('@playwright/test').APIRequestContext} api
   * @param {{ description?: string, access?: string, asObject?: boolean }} opts
   */
  async function mkToken(api, { description, access = 'read', asObject = false } = {}) {
    const body = {};
    if (description !== undefined) body.description = description;
    if (access !== undefined) body.access = asObject ? { read: true, write: true } : access;
    const res = asObject
      ? await api.post('/api/account/token', { data: body })
      : await api.post('/api/account/token', { form: body });
    expect(res.ok(), `POST /api/account/token: ${res.status()}`).toBeTruthy();
    if (description === undefined) return { res, doc: null };
    const list = await (await api.get('/api/account/token')).json();
    const doc = (list.data || []).find((t) => t.description === description);
    if (doc) created.push(doc.token);
    return { res, doc };
  }

  /** Contexto autenticado por X-API-TOKEN (sin sesión). */
  async function withToken(playwright, tokenValue) {
    return playwright.request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { 'X-API-TOKEN': tokenValue },
      timeout: 30_000,
    });
  }

  // ─── Creación y persistencia del scope ──────────────────────────────────────

  test('crear token read persiste access {read:true, write:false} @TOK-TC-005', async ({ api }) => {
    const { doc } = await mkToken(api, { description: uniqueDesc('read'), access: 'read' });
    expect(doc).toBeTruthy();
    expect(doc.access).toEqual({ read: true, write: false });
  });

  test('crear token write persiste access {read:true, write:true} @TOK-TC-006', async ({ api }) => {
    const { doc } = await mkToken(api, { description: uniqueDesc('write'), access: 'write' });
    expect(doc).toBeTruthy();
    expect(doc.access).toEqual({ read: true, write: true });
  });

  // ─── Scope de LECTURA ───────────────────────────────────────────────────────

  test('token read: GET /api/show/list y GET /api/media responden 200 @TOK-TC-007', async ({ api, playwright }) => {
    const { doc } = await mkToken(api, { description: uniqueDesc('read'), access: 'read' });
    const ctx = await withToken(playwright, doc.token);
    try {
      expect((await ctx.get('/api/show/list?limit=1')).status()).toBe(200);
      expect((await ctx.get('/api/media?limit=1')).status()).toBe(200);
    } finally {
      await ctx.dispose();
    }
  });

  test('token read: POST a media/live-stream/playlist responde 403 @TOK-TC-008', async ({ api, playwright }) => {
    const { doc } = await mkToken(api, { description: uniqueDesc('read'), access: 'read' });
    const ctx = await withToken(playwright, doc.token);
    try {
      for (const [path, form] of [
        ['/api/media', { title: 'x', type: 'video' }],
        ['/api/live-stream/', { name: 'x', type: 'video' }],
        ['/api/playlist', { name: 'x' }],
      ]) {
        const r = await ctx.post(path, { form });
        expect(r.status(), `POST ${path} con token read debe ser 403`).toBe(403);
      }
    } finally {
      await ctx.dispose();
    }
  });

  // ─── Scope de ESCRITURA ─────────────────────────────────────────────────────

  test('token write: GET y POST /api/show (crear) responden 200 @TOK-TC-009', async ({ api, playwright }) => {
    const { doc } = await mkToken(api, { description: uniqueDesc('write'), access: 'write' });
    const ctx = await withToken(playwright, doc.token);
    try {
      expect((await ctx.get('/api/show/list?limit=1')).status()).toBe(200);
      const create = await ctx.post('/api/show', {
        form: { type: 'tvshow', title: uniqueDesc('w-show') },
      });
      expect(create.status(), `POST /api/show con token write: ${create.status()}`).toBe(200);
      const body = await create.json();
      const id = (body.data ?? body)._id;
      if (id) await ctx.delete(`/api/show/${id}`); // limpieza del recurso creado
    } finally {
      await ctx.dispose();
    }
  });

  // ─── Seguridad: token borrado deja de autenticar ────────────────────────────

  test('token borrado se invalida al instante (GET -> 403) @TOK-TC-010', async ({ api, playwright }) => {
    const desc = uniqueDesc('delme');
    const { doc } = await mkToken(api, { description: desc, access: 'read' });
    const ctx = await withToken(playwright, doc.token);
    try {
      expect((await ctx.get('/api/show/list?limit=1')).status()).toBe(200);
      const del = await api.delete(`/api/account/token/${doc.token}`);
      expect(del.status(), 'DELETE token').toBe(200);
      created.splice(created.indexOf(doc.token), 1); // ya borrado
      await expect
        .poll(async () => (await ctx.get('/api/show/list?limit=1')).status(), { timeout: 5_000 })
        .toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  // ─── BUG vivo: read-token POST /api/show devuelve 500 (debería 403) ─────────

  test('token read: POST /api/show responde 403 (no 500) @TOK-TC-011', async ({ api, playwright }) => {
    test.fail(
      true,
      'BUG Jurrego1771/AQ2#55: read-only token en POST /api/show devuelve 500 {"message":null} en ' +
        'vez del 403 que dan media/live-stream/playlist. Manejo de error inconsistente en el gate de escritura.'
    );
    const { doc } = await mkToken(api, { description: uniqueDesc('read'), access: 'read' });
    const ctx = await withToken(playwright, doc.token);
    try {
      const r = await ctx.post('/api/show', { form: { type: 'tvshow', title: 'x' } });
      expect(r.status(), `esperado 403, obtenido ${r.status()}`).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });

  // ─── Mejoras no bloqueantes (documentan comportamiento actual) ──────────────

  test('crear token SIN descripción es aceptado (200) @TOK-TC-012', async ({ api }) => {
    // Mejora #5 (no bloqueante): el server no exige descripción -> tokens difíciles
    // de auditar. Se protege el contrato actual (200) para detectar si cambia.
    const before = ((await (await api.get('/api/account/token')).json()).data || []).length;
    const { res } = await mkToken(api, { access: 'read' }); // sin description
    expect(res.status()).toBe(200);
    // limpieza: el sin-descripción no se pudo trackear por desc -> borrar el nuevo.
    const list = ((await (await api.get('/api/account/token')).json()).data || []);
    expect(list.length).toBe(before + 1);
    const fresh = list
      .filter((t) => !t.description)
      .sort((a, b) => new Date(b.date_created) - new Date(a.date_created))[0];
    if (fresh) await api.delete(`/api/account/token/${fresh.token}`);
  });

  test('access como objeto cae a read-only en silencio @TOK-TC-013', async ({ api }) => {
    // Mejora #6 (no bloqueante): el server solo activa write con el string 'write'.
    // Un access estructurado {read,write} se ignora y queda read-only (falla seguro,
    // pero silencioso). Se documenta el comportamiento actual.
    const { doc } = await mkToken(api, { description: uniqueDesc('objaccess'), asObject: true });
    expect(doc).toBeTruthy();
    expect(doc.access).toEqual({ read: true, write: false });
  });
});
