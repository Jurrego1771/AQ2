// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * Integration — Live Stream Schedules: edge cases, validacion y auth.
 *
 * Port parcial de api_test_flow/tests/api/integration/live/live-schedule.integration.spec.js
 * (TC_SCH_*) adaptado al estilo AQ2: self-contained (fixture liveStream por
 * test, no live compartido), liveStreamClient + scheduleClient del factory
 * de AQ2, ResourceCleaner via fixture.
 *
 * **No** re-cubre lo que ya tenemos en tests/api/live-stream-schedule.api.spec.js:
 *   - LIVE-TC-8  (onetime valido)       -> cubierto
 *   - LIVE-TC-9  (recurrente <=1y)       -> cubierto
 *   - LIVE-TC-10 (recurrente >1y 400)    -> cubierto
 *   - LIVE-TC-11 (fin pasado BUG #18)    -> cubierto como test.fail()
 *   - LIVE-TC-12 (solape BUG #19)        -> cubierto como test.fail()
 *   - LIVE-TC-13 (vaciar texto BUG #23)  -> cubierto como test.fail()
 *
 * Lo que suma este spec:
 *   1. GET: fake id, headers, data structure
 *   2. POST: missing required fields, end-hour < start-hour, invalid minute,
 *            recurring sin days, extra unknown fields
 *   3. Edge: malformed live id, job id inexistente, empty payload, null values
 *   4. Auth: GET/POST/DELETE sin token
 *
 * Sigue la convencion AQ2 de tolerar respuestas backend drift
 * (expect([200, 400, 404]).toContain) en los endpoints donde el server puede
 * haber cambiado el contrato.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

const dayStr = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const onetime = (name, d, sh, eh) => ({
  name,
  type: 'onetime',
  date_start: d,
  date_end: d,
  date_start_hour: sh,
  date_start_minute: 0,
  date_end_hour: eh,
  date_end_minute: 0,
  tz_offset: 0,
  for_recording: false,
});

const FUTURE_DAY = dayStr(30);

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe('Schedule-Job — edge cases, validacion y auth @api @live-stream', () => {
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 1. GET — Validacion
  // ═══════════════════════════════════════════════════════════════════════

  test('GET con id inexistente (ObjectId valido pero no existe) responde 200/404 @LIVE-TC-62', async ({
    liveStreamClient,
  }) => {
    const fakeId = '000000000000000000000000';
    const r = await liveStreamClient.scheduleJobs(fakeId);
    expect([200, 404].includes(r.status()), `GET fake id: ${r.status()}`).toBeTruthy();
  });

  test('GET responde Content-Type JSON @LIVE-TC-63', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.scheduleJobs(liveStream);
    expect(r.status()).toBe(200);
    const ct = r.headers()['content-type'] || '';
    expect(ct, `Content-Type no es JSON: ${ct}`).toMatch(/application\/json/i);
  });

  test('GET data con schedules presentes tiene la estructura esperada (date_start, _id, etc.) @LIVE-TC-64', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // Creamos un schedule para garantizar que data[] no esta vacio.
    const created = await liveStreamClient.createScheduleJob(
      liveStream,
      onetime('QA structure', FUTURE_DAY, 10, 12)
    );
    expect(created.status()).toBe(200);
    const sid = (await created.json()).data._id;

    const list = await liveStreamClient.scheduleJobs(liveStream, { all: 'true' });
    expect(list.status()).toBe(200);
    const items = ((await list.json()).data || []).filter((s) => s && !Array.isArray(s));
    const found = items.find((s) => s._id === sid);
    expect(found, 'el schedule creado debe estar en la lista').toBeTruthy();
    // Campos contract: verificado en vivo.
    for (const f of ['_id', 'date_start', 'date_end', 'name', 'type']) {
      expect(found, `falta campo ${f}`).toHaveProperty(f);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. POST — Validacion de payload
  // ═══════════════════════════════════════════════════════════════════════

  test('POST con payload incompleto (solo name) debe rechazarse 4xx @LIVE-TC-65', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createScheduleJob(liveStream, {
      name: 'PartialJob',
    });
    expect(
      [400, 422].includes(r.status()),
      `payload incompleto devolvio ${r.status()} (deberia ser 4xx)`
    ).toBeTruthy();
  });

  test('POST con end_hour < start_hour (mismo dia) debe rechazarse 4xx @LIVE-TC-66', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createScheduleJob(
      liveStream,
      onetime('QA end<start', FUTURE_DAY, 18, 10) // end antes que start
    );
    expect(
      [400, 422].includes(r.status()),
      `end<start devolvio ${r.status()} (deberia ser 4xx)`
    ).toBeTruthy();
  });

  test('POST con date_start_minute=99 (invalido) debe rechazarse 4xx [BUG NUEVO: server acepta minute fuera de rango] @LIVE-TC-67', async ({
    liveStreamClient,
    liveStream,
  }) => {
    test.fail(
      true,
      'BUG nuevo: el server acepta date_start_minute=99 sin validar (devuelve 200) — falta validacion de rango de minutos en schedule-job (seria un issue nuevo #25)'
    );
    const r = await liveStreamClient.createScheduleJob(liveStream, {
      ...onetime('QA invalid minute', FUTURE_DAY, 10, 12),
      date_start_minute: 99,
    });
    // Si el bug se arregla, este test pasara. Mientras tanto, la prueba viva
    // espera que el server rechace 4xx.
    expect(
      [400, 422].includes(r.status()),
      `minute=99 devolvio ${r.status()} (deberia ser 4xx)`
    ).toBeTruthy();
  });

  test('POST recurrente sin days debe rechazarse 4xx o persistir como 0 days @LIVE-TC-68', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createScheduleJob(liveStream, {
      name: 'QA recurrent sin days',
      type: 'recurrent',
      date_start: dayStr(10),
      date_end: dayStr(60), // <= 1y
      date_start_hour: 10,
      date_start_minute: 0,
      date_end_hour: 11,
      date_end_minute: 0,
      tz_offset: 0,
      recurrency: { days: '', start_hour: 10, start_minute: 0, duration_hours: 1, duration_minutes: 0 },
    });
    // El server puede rechazar (400) o aceptar con days vacio (200). Ambos OK.
    expect([200, 400, 422].includes(r.status()), `recurring sin days: ${r.status()}`).toBeTruthy();

    // Si se creo, lo borramos via DELETE.
    if (r.status() === 200) {
      const sid = (await r.json()).data._id;
      await liveStreamClient.removeScheduleJob(liveStream, sid);
    }
  });

  test('POST con campos extra desconocidos no debe crashear (200 o 400, no 500) @LIVE-TC-69', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createScheduleJob(liveStream, {
      ...onetime('QA extra fields', FUTURE_DAY, 10, 12),
      unknownField: 'whatever',
      anotherExtra: true,
    });
    expect(
      [200, 400, 422].includes(r.status()),
      `extra fields devolvio ${r.status()} (no debe ser 500)`
    ).toBeTruthy();

    if (r.status() === 200) {
      const sid = (await r.json()).data._id;
      await liveStreamClient.removeScheduleJob(liveStream, sid);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Edge cases
  // ═══════════════════════════════════════════════════════════════════════

  test('GET con id malformado (no-ObjectId) responde 4xx/404, NO 500 @LIVE-TC-70', async ({
    liveStreamClient,
  }) => {
    const r = await liveStreamClient.scheduleJobs('!@#$%malformed');
    expect(
      [400, 404, 422].includes(r.status()),
      `id malformado devolvio ${r.status()} (no debe ser 500)`
    ).toBeTruthy();
  });

  test('GET de un job id que no existe responde 200/404 (no 500) @LIVE-TC-71', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.scheduleJob(liveStream, '000000000000000000000099');
    expect([200, 404].includes(r.status()), `job id inexistente: ${r.status()}`).toBeTruthy();
  });

  test('POST con payload vacio {} responde 4xx o 200 (no 500) @LIVE-TC-72', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.createScheduleJob(liveStream, {});
    expect(
      [200, 400, 422].includes(r.status()),
      `payload vacio devolvio ${r.status()} (no debe ser 500)`
    ).toBeTruthy();
  });

  test('GET responde en menos de 5 segundos (smoke de performance) @LIVE-TC-73', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const start = Date.now();
    const r = await liveStreamClient.scheduleJobs(liveStream);
    const elapsed = Date.now() - start;
    expect(r.ok(), `GET schedules fallo: ${r.status()}`).toBeTruthy();
    expect(elapsed, `GET tardo ${elapsed}ms (limite 5s)`).toBeLessThan(5000);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Auth — Sin token
  // ═══════════════════════════════════════════════════════════════════════

  test('GET sin token responde 401 o 403 @LIVE-TC-74', async ({
    liveStream,
    playwright,
  }) => {
    // Contexto sin storageState ni cookies: el server debe rechazar.
    const unauth = await playwright.request.newContext({ baseURL: env.baseURL });
    try {
      const r = await unauth.get(`/api/live-stream/${liveStream}/schedule-job/`);
      expect(
        [401, 403].includes(r.status()),
        `GET sin token devolvio ${r.status()} (deberia ser 401/403)`
      ).toBeTruthy();
    } finally {
      await unauth.dispose();
    }
  });

  test('POST sin token responde 401 o 403 @LIVE-TC-75', async ({
    liveStream,
    playwright,
  }) => {
    const unauth = await playwright.request.newContext({ baseURL: env.baseURL });
    try {
      const r = await unauth.post(`/api/live-stream/${liveStream}/schedule-job/`, {
        data: onetime('QA no-auth', dayStr(45), 10, 12),
      });
      expect(
        [401, 403].includes(r.status()),
        `POST sin token devolvio ${r.status()} (deberia ser 401/403)`
      ).toBeTruthy();
    } finally {
      await unauth.dispose();
    }
  });

  test('DELETE sin token responde 401 o 403 @LIVE-TC-76', async ({
    liveStream,
    playwright,
  }) => {
    const unauth = await playwright.request.newContext({ baseURL: env.baseURL });
    try {
      const r = await unauth.delete(
        `/api/live-stream/${liveStream}/schedule-job/000000000000000000000001`
      );
      expect(
        [401, 403].includes(r.status()),
        `DELETE sin token devolvio ${r.status()} (deberia ser 401/403)`
      ).toBeTruthy();
    } finally {
      await unauth.dispose();
    }
  });
});