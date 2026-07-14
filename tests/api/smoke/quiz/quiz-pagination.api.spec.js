// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');
const { createTranscodedMedia } = require('../../../../src/api/media-factory');
const { ResourceCleaner } = require('../../../../src/fixtures/resource-cleaner');

/**
 * API — Quiz Manager: paginación, orden de clasificación e intervalo mínimo
 * (mediastream/sm2#8032) @api @quiz-manager.
 *
 * Contrato verificado en vivo antes de escribir estos specs (ver
 * knowledge-core/modules/quiz-manager). Cubre 3 de las 4 AC de US-020;
 * QUIZ-AC-4 (controles de UI) queda pendiente, ver tests.yaml.
 *
 * El entorno dev muestra propagación eventual entre un POST de creación y el
 * siguiente GET de listado (confirmado: sin expect.poll, la primera lectura
 * a veces ve menos quizzes de los recién creados). Todas las lecturas
 * "recién escritas" van envueltas en expect.poll, no en un fetch único.
 */

/** @param {import('@playwright/test').APIRequestContext} api */
function createQuiz(api, basePath, { title, timestamp, correctText = 'A', wrongText = 'B' }) {
  return api.post(`${basePath}/quizzes`, {
    data: {
      title,
      timestamp,
      questions: [{ text: title, options: [{ text: correctText, isCorrect: true }, { text: wrongText, isCorrect: false }] }],
    },
  });
}

/** @param {import('@playwright/test').APIRequestContext} api */
async function listQuizzes(api, basePath, query = '') {
  const res = await api.get(`${basePath}/quizzes${query}`);
  return res.json();
}

const POLL_OPTS = { timeout: 15_000, intervals: [500, 1000, 2000] };

test.describe('Quiz Manager — paginación y orden @api @quiz-manager', () => {
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  test('paginación de quizzes de un live-stream: contrato completo @QUIZ-TC-1', async ({
    api,
    liveStream,
  }) => {
    const base = `/api/live-stream/${liveStream}`;
    const titles = [];
    for (let i = 1; i <= 7; i++) {
      const title = `Quiz ${i}`;
      titles.push(title);
      const res = await createQuiz(api, base, { title });
      expect(res.status(), `crear "${title}" respondió ${res.status()}`).toBe(201);
    }
    // Orden esperado: date_created desc -> el más nuevo (Quiz 7) primero.
    const expectedOrder = [...titles].reverse();

    // Sin params: modo legado, sin campo pagination. Poll: tolera propagación.
    await expect
      .poll(async () => {
        const legacy = await listQuizzes(api, base);
        return legacy.quizzes.map((/** @type {any} */ q) => q.title);
      }, POLL_OPTS)
      .toEqual(expectedOrder);
    expect((await listQuizzes(api, base)).pagination).toBeUndefined();

    // Página 1 de 3 (tamaño 3): primeros 3 del orden esperado.
    await expect
      .poll(async () => {
        const page1 = await listQuizzes(api, base, '?page=1&items_per_page=3');
        return page1.quizzes.map((/** @type {any} */ q) => q.title);
      }, POLL_OPTS)
      .toEqual(expectedOrder.slice(0, 3));
    expect((await listQuizzes(api, base, '?page=1&items_per_page=3')).pagination).toEqual({
      page: 1,
      items_per_page: 3,
      total: 7,
      total_pages: 3,
    });

    // Última página (3 de 3): resto (1 item).
    const page3 = await listQuizzes(api, base, '?page=3&items_per_page=3');
    expect(page3.quizzes.map((/** @type {any} */ q) => q.title)).toEqual(expectedOrder.slice(6, 7));

    // Página fuera de rango: 200 con array vacío, no error.
    const outOfRange = await api.get(`${base}/quizzes?page=99&items_per_page=3`);
    expect(outOfRange.ok()).toBeTruthy();
    expect((await outOfRange.json()).quizzes).toEqual([]);

    // items_per_page fuera del cap: clamp a 100.
    const huge = await listQuizzes(api, base, '?page=1&items_per_page=500');
    expect(huge.pagination.items_per_page).toBe(100);
    expect(huge.quizzes).toHaveLength(7);
  });

  test('paginación de quizzes de un media: orden por línea de tiempo, no por creación @QUIZ-TC-2', async ({
    api,
  }) => {
    test.setTimeout(60_000);
    const cleaner = new ResourceCleaner(api);
    const mediaId = await createTranscodedMedia(api, {
      fileUrl: 'https://cdn.pixabay.com/video/2022/10/01/133165-755982945_tiny.mp4',
      fileName: `[QA-AUTO] Quiz order probe ${Date.now()}`,
      waitTranscoding: false,
    });
    cleaner.register('media', mediaId);
    const base = `/api/media/${mediaId}`;

    try {
      // Se crean deliberadamente FUERA de orden temporal: si el endpoint
      // ordenara por fecha de creación (como live-stream) en vez de por
      // trigger_time, este test lo detectaría.
      const specs = [
        { title: 'Quiz en 300s', timestamp: 300 },
        { title: 'Quiz en 100s', timestamp: 100 },
        { title: 'Quiz en 200s', timestamp: 200 },
      ];
      for (const s of specs) {
        const res = await createQuiz(api, base, s);
        expect(res.status(), `crear "${s.title}" respondió ${res.status()}`).toBe(201);
      }

      await expect
        .poll(async () => {
          const list = await listQuizzes(api, base);
          return list.quizzes.map((/** @type {any} */ q) => q.trigger_time);
        }, POLL_OPTS)
        .toEqual([100, 200, 300]);

      const paged = await listQuizzes(api, base, '?page=1&items_per_page=2');
      expect(paged.quizzes.map((/** @type {any} */ q) => q.trigger_time)).toEqual([100, 200]);
      expect(paged.pagination).toEqual({ page: 1, items_per_page: 2, total: 3, total_pages: 2 });
    } finally {
      await cleaner.clean();
    }
  });

  test('media: intervalo mínimo entre quizzes se valida en el servidor, límite exacto se acepta @QUIZ-TC-3', async ({
    api,
  }) => {
    test.setTimeout(60_000);
    const cleaner = new ResourceCleaner(api);
    const mediaId = await createTranscodedMedia(api, {
      fileUrl: 'https://cdn.pixabay.com/video/2022/10/01/133165-755982945_tiny.mp4',
      fileName: `[QA-AUTO] Quiz interval probe ${Date.now()}`,
      waitTranscoding: false,
    });
    cleaner.register('media', mediaId);
    const base = `/api/media/${mediaId}`;

    try {
      const account = await (await api.get('/api/account')).json();
      const intervalMinutes = account.data?.account?.ops?.media?.quiz_interval || 1;
      const intervalSeconds = intervalMinutes * 60;

      const baseline = await createQuiz(api, base, { title: 'Base', timestamp: 100 });
      expect(baseline.status()).toBe(201);

      // Justo por debajo del intervalo: rechaza.
      const tooClose = await createQuiz(api, base, {
        title: 'Too close',
        timestamp: 100 + intervalSeconds - 1,
      });
      expect(tooClose.status()).toBe(400);
      expect((await tooClose.json()).message).toContain('minutes between quizzes');

      // Exactamente al límite: acepta (frontera documentada en el código
      // fuente: comparación estrictamente menor, el límite exacto no bloquea).
      const atBoundary = await createQuiz(api, base, {
        title: 'At boundary',
        timestamp: 100 + intervalSeconds,
      });
      expect(atBoundary.status()).toBe(201);

      // Editar el quiz base sin cambiar su timestamp debe seguir permitido
      // (excludeQuizId lo excluye de su propio chequeo). Poll: tolera
      // propagación entre el POST de creación y su aparición en el listado.
      let baselineQuiz = null;
      await expect
        .poll(async () => {
          const list = await listQuizzes(api, base);
          baselineQuiz = list.quizzes.find((/** @type {any} */ q) => q.title === 'Base') || null;
          return !!baselineQuiz;
        }, POLL_OPTS)
        .toBe(true);

      const selfEdit = await api.post(`${base}/quizzes/${baselineQuiz._id}`, {
        data: { title: 'Base', timestamp: 100, questions: baselineQuiz.questions },
      });
      expect(selfEdit.status()).toBe(200);
    } finally {
      await cleaner.clean();
    }
  });
});
