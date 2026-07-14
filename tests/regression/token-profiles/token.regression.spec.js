// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');

/**
 * @regression @token — flujo self-service de tokens read/write en /settings/api.
 * Verde = comportamiento correcto protegido. Verificado en vivo 2026-07-14.
 *
 * Los tokens se crean por UI y se limpian por API (sesión) en afterEach: red de
 * seguridad para que un fallo a mitad de test no deje tokens huérfanos. Nunca se
 * tocan los tokens que no llevan la marca [QA-AUTO][run=...].
 */
const MINE = /\[QA-AUTO\]\[run=/;

test.describe('API Tokens — flujo UI @regression @token', () => {
  test.skip(env.isProd, 'no se crean tokens contra prod (prodGuard)');

  const uniqueDesc = (label) =>
    `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  test.afterEach(async ({ api }) => {
    const list = ((await (await api.get('/api/account/token')).json()).data || []);
    for (const t of list.filter((x) => MINE.test(x.description || ''))) {
      await api.delete(`/api/account/token/${t.token}`).catch(() => {});
    }
  });

  test('crear token Read por UI aparece en la tabla con Access "Read" @TOK-TC-015', async ({ tokenPage }) => {
    await tokenPage.goto();
    const desc = uniqueDesc('read');
    await tokenPage.create({ description: desc, access: 'read' });

    await expect(tokenPage.row(desc)).toBeVisible();
    await expect
      .poll(() => tokenPage.accessText(desc), { timeout: 10_000 })
      .toMatch(/\bRead\b(?!\+)/); // "Read", no "Read+Write"
  });

  test('crear token Write por UI aparece con Access "Read+Write" @TOK-TC-016', async ({ tokenPage }) => {
    await tokenPage.goto();
    const desc = uniqueDesc('write');
    await tokenPage.create({ description: desc, access: 'write' });

    await expect(tokenPage.row(desc)).toBeVisible();
    await expect
      .poll(() => tokenPage.accessText(desc), { timeout: 10_000 })
      .toContain('Read+Write');
  });

  test('borrar un token pide confirmación y elimina la fila @TOK-TC-017', async ({ tokenPage, page }) => {
    await tokenPage.goto();
    const desc = uniqueDesc('delme');
    await tokenPage.create({ description: desc, access: 'read' });
    await expect(tokenPage.row(desc)).toBeVisible();

    // El borrado dispara un confirm() nativo (prevención de errores, Nielsen #5).
    let dialogMsg = '';
    page.once('dialog', (d) => { dialogMsg = d.message(); d.accept(); });
    await tokenPage.deleteButton(desc).click();

    await expect(tokenPage.row(desc)).toHaveCount(0);
    expect(dialogMsg).toMatch(/sure|permanent|delet/i);
  });

  test('toggle deshabilita un token y deja de autenticar @TOK-TC-018', async ({ tokenPage, page, api, playwright }) => {
    await tokenPage.goto();
    const desc = uniqueDesc('toggle');
    await tokenPage.create({ description: desc, access: 'read' });
    await expect(tokenPage.row(desc)).toBeVisible();

    // Valor del token (la UI lo enmascara) -> se lee por sesión para poder probarlo.
    const doc = ((await (await api.get('/api/account/token')).json()).data || [])
      .find((t) => t.description === desc);
    expect(doc, 'token creado debe existir por API').toBeTruthy();

    const ctx = await playwright.request.newContext({
      baseURL: env.baseURL, extraHTTPHeaders: { 'X-API-TOKEN': doc.token }, timeout: 30_000,
    });
    try {
      expect((await ctx.get('/api/show/list?limit=1')).status(), 'habilitado autentica').toBe(200);

      // Toggle en la UI (por si dispara confirm, se auto-acepta).
      page.on('dialog', (d) => d.accept().catch(() => {}));
      await tokenPage.toggleButton(desc).click();

      // Deshabilitado deja de autenticar (invalidación inmediata).
      await expect
        .poll(async () => (await ctx.get('/api/show/list?limit=1')).status(), { timeout: 8_000 })
        .toBe(403);
    } finally {
      await ctx.dispose();
    }
  });
});
