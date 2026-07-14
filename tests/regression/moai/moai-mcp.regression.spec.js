// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');

/**
 * @regression @moai — MCP Tokens (MoAI Options, /settings/ai).
 *
 * Un MCP token es un token de cuenta con el TokenProfile MoAI (isForMoAI). El
 * front resuelve ese profile y lo manda al crear; por eso el flujo self-service
 * se cubre por UI (crear por API puro requiere el profile id, no expuesto por un
 * GET limpio). Verificado en vivo 2026-07-14: create = POST /api/account/token
 * con profile=<moai>; list = GET /api/account/token/mcp; delete = DELETE /token/:token.
 *
 * Self-contained: crea por UI y limpia por API (sesión) en afterEach. Nunca toca
 * tokens sin la marca [QA-AUTO][run=].
 */
const MINE = /\[QA-AUTO\]\[run=/;

test.describe('MoAI — MCP Tokens UI @regression @moai', () => {
  test.skip(env.isProd, 'no se crean tokens contra prod (prodGuard)');

  const uniqueDesc = (l) =>
    `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${l} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  test.afterEach(async ({ api }) => {
    const list = ((await (await api.get('/api/account/token/mcp')).json()).data || []);
    for (const t of list.filter((x) => MINE.test(x.description || ''))) {
      await api.delete(`/api/account/token/${t.token}`).catch(() => {});
    }
  });

  test('crear un MCP token por UI aparece en la tabla y se puede borrar @MOAI-TC-8', async ({ moaiPage, page, api }) => {
    await moaiPage.goto();
    const desc = uniqueDesc('mcp');
    await moaiPage.createMcpToken(desc, 'read');

    // Aparece en la tabla de MCP tokens.
    await expect(moaiPage.mcpRow(desc)).toBeVisible();

    // Y quedó persistido con el profile MoAI (verificación de contrato por API).
    const doc = ((await (await api.get('/api/account/token/mcp')).json()).data || [])
      .find((t) => t.description === desc);
    expect(doc, 'MCP token creado debe existir por API').toBeTruthy();
    expect(doc.profile, 'debe llevar el TokenProfile MoAI').toBeTruthy();

    // Borrado (via API, el afterEach también barre): deja de aparecer en el listado.
    const del = await api.delete(`/api/account/token/${doc.token}`);
    expect(del.status()).toBe(200);
    const after = ((await (await api.get('/api/account/token/mcp')).json()).data || []);
    expect(after.some((t) => t.token === doc.token)).toBe(false);
  });
});
