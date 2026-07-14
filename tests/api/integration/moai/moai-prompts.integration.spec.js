// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');

/**
 * @api @moai — Prompts de IA de la cuenta (MoAI Options, US-037).
 *
 * Estrategia de QA para features de IA: separar la capa DETERMINISTA (CRUD de
 * prompts, validación) — asertada de forma exacta — de la NO-DETERMINISTA
 * (invocación viva a OpenAI vía /improve) — asertada por CONTRATO (estructura +
 * ciclo async), nunca por el contenido generado (flaky por diseño y quema cuota).
 *
 * Contrato verificado en vivo 2026-07-14 (paths capturados de la red real, no
 * inferidos del código):
 *   GET    /api/settings/ai/prompts
 *   POST   /api/settings/ai/prompts            (form: title, customPromptText, type)
 *   DELETE /api/settings/ai/prompts/:id
 *   POST   /api/settings/ai/prompts/:id/improve
 *
 * Self-contained: crea/borra sus propios prompts [QA-AUTO][run=] por sesión.
 */
test.describe('MoAI — prompts de IA @api @moai', () => {
  test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');

  const PROMPTS = '/api/settings/ai/prompts';
  /** @type {string[]} */
  let created;
  test.beforeEach(() => { created = []; });
  test.afterEach(async ({ api }) => {
    for (const id of created) await api.delete(`${PROMPTS}/${id}`).catch(() => {});
  });

  const uniqueTitle = (l) =>
    `[QA-AUTO][run=${process.env.QA_RUN_ID || 'local'}] ${l} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  async function createPrompt(api, { title, type = 'metadata', customPromptText = 'Genera metadata para {title}.' }) {
    const res = await api.post(PROMPTS, { form: { title, type, customPromptText } });
    expect(res.status(), `POST ${PROMPTS}: ${res.status()}`).toBe(200);
    const doc = (await res.json()).data;
    if (doc?._id) created.push(doc._id);
    return doc;
  }

  // ─── CRUD determinista ──────────────────────────────────────────────────────

  test('GET prompts responde 200 con lista de prompts estructurados @MOAI-TC-1', async ({ api }) => {
    const res = await api.get(PROMPTS);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(Array.isArray(body.data)).toBe(true);
    // La cuenta trae prompts default: si hay alguno, valida el shape mínimo.
    if (body.data.length) {
      const p = body.data[0];
      expect(p).toHaveProperty('_id');
      expect(p).toHaveProperty('type');
      expect(typeof p.title === 'string').toBe(true);
    }
  });

  test('crear un prompt persiste y aparece en la lista @MOAI-TC-2', async ({ api }) => {
    const title = uniqueTitle('create');
    const doc = await createPrompt(api, { title, type: 'metadata' });
    expect(doc._id).toBeTruthy();
    expect(doc.title).toBe(title);
    expect(doc.type).toBe('metadata');
    expect(typeof doc.customPromptText).toBe('string');

    const list = (await (await api.get(PROMPTS)).json()).data || [];
    expect(list.some((p) => p._id === doc._id)).toBe(true);
  });

  test('borrar un prompt responde 200 y desaparece de la lista @MOAI-TC-3', async ({ api }) => {
    const doc = await createPrompt(api, { title: uniqueTitle('delete') });
    const del = await api.delete(`${PROMPTS}/${doc._id}`);
    expect(del.status()).toBe(200);
    created.splice(created.indexOf(doc._id), 1);
    const list = (await (await api.get(PROMPTS)).json()).data || [];
    expect(list.some((p) => p._id === doc._id)).toBe(false);
  });

  // ─── Validación determinista de la invocación IA ────────────────────────────

  test('improve sin title responde 400 (no 500/crash) @MOAI-TC-4', async ({ api }) => {
    const doc = await createPrompt(api, { title: uniqueTitle('improve-val') });
    const res = await api.post(`${PROMPTS}/${doc._id}/improve`, { data: { customPromptText: 'x' } });
    // Contrato: rechaza con 4xx, nunca 500. (El mensaje MISSING_PROMPT_ID es
    // algo engañoso cuando el id va en la URL — mejora MOAI-RISK-2, no bloqueante.)
    expect(res.status(), `esperado 4xx, obtenido ${res.status()}`).toBe(400);
  });

  // ─── MCP Tokens: contrato del listado ───────────────────────────────────────

  test('GET token/mcp responde 200 con la lista de tokens MCP @MOAI-TC-7', async ({ api }) => {
    // Los MCP tokens son tokens de cuenta con el TokenProfile MoAI. El listado
    // los filtra por ese profile (server-side). Contrato: 200 + data array; si
    // hay alguno, cada uno trae profile (el MoAI) y access.
    const res = await api.get('/api/account/token/mcp');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(Array.isArray(body.data)).toBe(true);
    for (const t of body.data) {
      expect(t).toHaveProperty('token');
      expect(t).toHaveProperty('profile'); // el TokenProfile MoAI
      expect(t.access).toBeTruthy();
    }
  });

  // ─── Invocación IA VIVA — contrato, no contenido ────────────────────────────
  // Gasta cuota real de OpenAI. Se puede desactivar con QA_SKIP_AI_LIVE=1.
  test('improve invoca la IA y responde con el contrato esperado @MOAI-TC-5', async ({ api }) => {
    test.skip(!!process.env.QA_SKIP_AI_LIVE, 'QA_SKIP_AI_LIVE: se omite la invocación IA viva (cuota)');
    test.setTimeout(30_000); // la llamada al proveedor puede tardar

    const doc = await createPrompt(api, { title: uniqueTitle('improve-live'), type: 'chapters' });
    // El handler exige `id` en el body (además del :id de la URL, ver MOAI-RISK-2).
    const res = await api.post(`${PROMPTS}/${doc._id}/improve`, {
      data: { id: doc._id, title: doc.title, customPromptText: doc.customPromptText },
    });
    expect(res.status(), `improve: ${res.status()}`).toBe(200);

    // Aserción de CONTRATO (propiedades), NO del texto generado (no-determinista).
    const ai = (await res.json())?.data?.data;
    expect(ai, 'payload de IA presente').toBeTruthy();
    expect(ai.status).toBe('completed');
    expect(ai.error).toBeNull();
    expect(typeof ai.model === 'string' && ai.model.length, 'modelo IA reportado').toBeTruthy();
    expect(typeof ai.duration === 'number').toBe(true);
    // El contenido mejorado existe y es texto no-vacío (sin asertar QUÉ dice).
    expect(typeof ai.data?.prompt === 'string' && ai.data.prompt.trim().length, 'prompt mejorado no vacío').toBeTruthy();
  });
});
