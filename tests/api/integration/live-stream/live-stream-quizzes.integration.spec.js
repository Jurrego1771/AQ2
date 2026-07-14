// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const { faker } = require('@faker-js/faker');

/**
 * Integration — Live Stream Quizzes (CRUD + send + auth).
 *
 * Port de api_test_flow/tests/api/integration/live/live-quizzes.integration.spec.js
 * (TC_LIV_*_quizzes_*) adaptado al estilo AQ2: storageState, liveStreamClient,
 * fixture liveStream (self-contained: cada test crea su live + su quiz y los
 * borra al terminar via ResourceCleaner con tipo 'quiz' = id compuesto
 * `${liveId}/${quizId}`).
 *
 * Contrato del backend (verificado en vivo):
 *   - GET    /api/live-stream/:id/quizzes       -> { status, quizzes: [...] }  (no `data:`)
 *   - POST   /api/live-stream/:id/quizzes       -> 201, { status, quiz: {...} } (no `data:`)
 *   - POST   /api/live-stream/:id/quizzes/:qid  -> update (requiere payload completo)
 *   - POST   /api/live-stream/:id/quizzes/:qid/send -> send to audience
 *   - DELETE /api/live-stream/:id/quizzes/:qid  -> { status, message }
 *   - Quiz usa `id` (no `_id`) en el response de create
 *   - Cada question requiere al menos una option con isCorrect:true
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Payload minimo valido: 1 question con 1 opcion correcta. */
function buildQuizPayload(attrs = {}) {
  return {
    title: `qa_quiz_${Date.now()}_${faker.string.alphanumeric(4)}`,
    questions: [
      {
        text: faker.lorem.sentence(),
        options: [
          { text: 'Option A', isCorrect: true },
          { text: 'Option B', isCorrect: false },
          { text: 'Option C', isCorrect: false },
        ],
      },
    ],
    ...attrs,
  };
}

/** Normaliza el body del response de quiz: el server usa `id` o `_id`. */
function quizIdOf(quiz) {
  return quiz?.id || quiz?._id;
}

/** Crea un quiz y devuelve el objeto quiz normalizado (sin registrar). */
async function createQuiz(liveStreamClient, liveId, attrs = {}) {
  const res = await liveStreamClient.createQuiz(liveId, buildQuizPayload(attrs));
  expect([200, 201].includes(res.status()), `createQuiz: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const quiz = body?.quiz || body?.data || body;
  const qid = quizIdOf(quiz);
  expect(qid, `createQuiz no devolvio id: ${JSON.stringify(body).slice(0, 200)}`).toBeTruthy();
  quiz._id = qid;
  return quiz;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe('Live Quizzes — CRUD + send + auth @api @live-stream', () => {
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 1. GET list
  // ═══════════════════════════════════════════════════════════════════════

  test('list: GET /:id/quizzes responde 200 con quizzes: [] @LIVE-TC-77', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.listQuizzes(liveStream);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('OK');
    // El contrato usa `quizzes:` (no `data:`) — verificacion de contrato.
    expect(Array.isArray(body.quizzes), `quizzes no es array: ${JSON.stringify(body).slice(0, 200)}`).toBeTruthy();
  });

  test('list: tras crear un quiz, aparece en la lista @LIVE-TC-78', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const quiz = await createQuiz(liveStreamClient, liveStream);
    const qid = quiz._id;

    const r = await liveStreamClient.listQuizzes(liveStream);
    expect(r.status()).toBe(200);
    const body = await r.json();
    const found = body.quizzes.some((q) => (q._id || q.id) === qid);
    expect(found, 'el quiz recien creado debe aparecer en la lista').toBeTruthy();

    // Cleanup manual.
    await liveStreamClient.deleteQuiz(liveStream, qid);
  });

  test('list: id no-ObjectId responde 404/500 (no 200 silencioso) @LIVE-TC-79', async ({
    liveStreamClient,
  }) => {
    const r = await liveStreamClient.get('/000000000000000000000000/quizzes');
    expect([404, 500].includes(r.status()), `id no existente: ${r.status()}`).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. POST create
  // ═══════════════════════════════════════════════════════════════════════

  test('create: POST /:id/quizzes responde 201 con quiz creado y status=draft @LIVE-TC-80', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createQuiz(liveStream, buildQuizPayload({ title: 'qa_create_ok' }));
    expect([200, 201].includes(r.status()), `create quiz: ${r.status()}`).toBeTruthy();
    const body = await r.json();
    const quiz = body?.quiz || body?.data || body;
    const qid = quizIdOf(quiz);
    expect(qid, 'create debe devolver id del quiz').toBeTruthy();
    expect(quiz.status).toBe('draft');
    // Cleanup.
    await liveStreamClient.deleteQuiz(liveStream, qid);
  });

  test('create: payload sin title debe rechazarse 4xx @LIVE-TC-81', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createQuiz(liveStream, {
      questions: [{ text: 'Q?', options: [{ text: 'A', isCorrect: true }] }],
    });
    expect([400, 422].includes(r.status()), `create sin title: ${r.status()}`).toBeTruthy();
  });

  test('create: payload sin questions debe rechazarse 4xx @LIVE-TC-82', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createQuiz(liveStream, {
      title: 'qa_no_questions',
    });
    expect([400, 422].includes(r.status()), `create sin questions: ${r.status()}`).toBeTruthy();
  });

  test('create: options sin isCorrect:true debe rechazarse 4xx @LIVE-TC-83', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createQuiz(liveStream, {
      title: 'qa_no_correct',
      questions: [
        {
          text: 'Q?',
          options: [
            { text: 'A', isCorrect: false },
            { text: 'B', isCorrect: false },
          ],
        },
      ],
    });
    expect([400, 422].includes(r.status()), `options sin correct: ${r.status()}`).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. POST update
  // ═══════════════════════════════════════════════════════════════════════

  test('update: POST /:id/quizzes/:qid con payload completo persiste el nuevo title @LIVE-TC-84', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Crear primero.
    const create = await liveStreamClient.createQuiz(liveStream, buildQuizPayload());
    const initial = await createJsonQuiz(create);
    const qid = initial._id;
    expect(qid).toBeTruthy();

    // Update con payload completo.
    const newTitle = `qa_updated_${faker.string.alphanumeric(6)}`;
    const upd = await liveStreamClient.updateQuiz(liveStream, qid, buildQuizPayload({ title: newTitle }));
    expect([200, 201].includes(upd.status()), `update quiz: ${upd.status()}`).toBeTruthy();
    // El response de update puede no traer el body completo; verificamos via
    // re-list que el title cambio.
    const list = await liveStreamClient.listQuizzes(liveStream);
    const items = ((await list.json()).quizzes) || [];
    const found = items.find((q) => (q._id || q.id) === qid);
    expect(found, 'el quiz actualizado debe estar en la lista').toBeTruthy();
    expect(found.title).toBe(newTitle);

    // Cleanup.
    await liveStreamClient.deleteQuiz(liveStream, qid);
  });

  test('update: id que no existe responde 4xx/5xx (no 200) @LIVE-TC-85', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.updateQuiz(
      liveStream,
      '000000000000000000000000',
      buildQuizPayload()
    );
    expect(
      [400, 404, 500].includes(r.status()),
      `update con id inexistente: ${r.status()} (deberia ser 4xx/5xx)`
    ).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. POST send
  // ═══════════════════════════════════════════════════════════════════════

  test('send: POST /:id/quizzes/:qid/send responde (200/400/500 segun estado del live) @LIVE-TC-86', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Crear primero.
    const create = await liveStreamClient.createQuiz(liveStream, buildQuizPayload());
    const initial = await createJsonQuiz(create);
    const qid = initial._id;

    // Send: el server puede responder 200/201 si el live esta online, o
    // 400/500 si el live no esta al aire. Toleramos.
    const send = await liveStreamClient.sendQuiz(liveStream, qid);
    expect([200, 201, 400, 500].includes(send.status()), `send quiz: ${send.status()}`).toBeTruthy();

    // Cleanup.
    await liveStreamClient.deleteQuiz(liveStream, qid);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. DELETE
  // ═══════════════════════════════════════════════════════════════════════

  test('delete: DELETE /:id/quizzes/:qid responde 200 (o 4xx esperable) y el quiz desaparece @LIVE-TC-87', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Crear primero.
    const create = await liveStreamClient.createQuiz(liveStream, buildQuizPayload());
    const initial = await createJsonQuiz(create);
    const qid = initial._id;

    // Borrar. Toleramos 200/204/404 (el server puede ya no tener el quiz
    // si fue consumido por el live online). El 500 NO es aceptable.
    const del = await liveStreamClient.deleteQuiz(liveStream, qid);
    expect(
      [200, 204, 404].includes(del.status()),
      `delete quiz devolvio ${del.status()} (no deberia ser 500)`
    ).toBeTruthy();

    // Verificar que no esta en la lista (si fue 200).
    if (del.status() === 200 || del.status() === 204) {
      const list = await liveStreamClient.listQuizzes(liveStream);
      const items = ((await list.json()).quizzes) || [];
      const found = items.some((q) => (q._id || q.id) === qid);
      expect(found, 'el quiz borrado no debe aparecer').toBeFalsy();
    }
  });

  test('delete: id que no existe responde 4xx/5xx (no 200) @LIVE-TC-88', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.deleteQuiz(liveStream, '000000000000000000000000');
    expect(
      [400, 404, 500].includes(r.status()),
      `delete id inexistente: ${r.status()} (deberia ser 4xx/5xx)`
    ).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 6. Auth — sin token
  // ═══════════════════════════════════════════════════════════════════════

  test('GET sin token responde 401/403 @LIVE-TC-89', async ({ liveStream, playwright }) => {
    const unauth = await playwright.request.newContext({ baseURL: env.baseURL });
    try {
      const r = await unauth.get(`/api/live-stream/${liveStream}/quizzes`);
      expect([401, 403].includes(r.status()), `GET sin token: ${r.status()}`).toBeTruthy();
    } finally {
      await unauth.dispose();
    }
  });

  test('POST sin token responde 401/403 @LIVE-TC-90', async ({ liveStream, playwright }) => {
    const unauth = await playwright.request.newContext({ baseURL: env.baseURL });
    try {
      const r = await unauth.post(`/api/live-stream/${liveStream}/quizzes`, {
        data: buildQuizPayload(),
      });
      expect([401, 403].includes(r.status()), `POST sin token: ${r.status()}`).toBeTruthy();
    } finally {
      await unauth.dispose();
    }
  });

  test('DELETE sin token responde 401/403 @LIVE-TC-91', async ({ liveStream, playwright }) => {
    const unauth = await playwright.request.newContext({ baseURL: env.baseURL });
    try {
      const r = await unauth.delete(`/api/live-stream/${liveStream}/quizzes/000000000000000000000000`);
      expect([401, 403].includes(r.status()), `DELETE sin token: ${r.status()}`).toBeTruthy();
    } finally {
      await unauth.dispose();
    }
  });
});

// ─── Helper local: extrae el quiz del response de create ────────────────────
function createJsonQuiz(res) {
  return res.json().then((body) => {
    const quiz = body?.quiz || body?.data || body;
    const qid = quiz?.id || quiz?._id;
    quiz._id = qid;
    return quiz;
  });
}