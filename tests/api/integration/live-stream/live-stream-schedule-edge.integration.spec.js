// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');

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
 *   5. Endpoint /schedule/:sid (sm2#8496) — happy path, sid inexistente,
 *      sid expirado y sin auth. Cubre el fix de if(schedule) → if(!_.isEmpty).
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

  test('GET con id inexistente (ObjectId valido pero no existe) responde 404 @LIVE-TC-62', async ({
    liveStreamClient,
  }) => {
    const fakeId = '000000000000000000000000';
    const r = await liveStreamClient.scheduleJobs(fakeId);
    // Comportamiento nuevo (alineado con sm2#8496): un live-stream que no
    // existe debe responder 404, no 200 con data:[] (listado vacio). Si este
    // test falla con 200, ver LIVE-RISK-18: patron latente find()+truthy en
    // schedule/index.js lineas 41 y 139 (fuera del scope del PR).
    expect(r.status(), `GET fake id devolvio ${r.status()} (debe ser 404)`).toBe(404);
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

  test('GET de un job id que no existe responde 404 (no 200, no 500) @LIVE-TC-71', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.scheduleJob(liveStream, '000000000000000000000099');
    // Comportamiento nuevo (alineado con sm2#8496): un recurso que no existe
    // debe responder 404 NOT_FOUND, no 200 con data:[]. Si este test falla
    // con 200, ver LIVE-RISK-18: patron latente find()+truthy en
    // schedule-job/getScheduleJobs.js:107 (fuera del scope del PR).
    expect(r.status(), `job id inexistente devolvio ${r.status()} (debe ser 404)`).toBe(404);
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
    // Robustez: una sola llamada bajo carga del dev compartido puede picar
    // >5s sin que la API sea lenta. Tomamos la mediana de 3 llamadas (warm-up
    // descartado para evitar el primer request JIT/Mongo session).
    // El umbral 5s sigue siendo valido como "smoke de regresion" — si la
    // mediana pasa a 5s, el problema es real; si solo 1 de 3 pica, es ruido.
    await liveStreamClient.scheduleJobs(liveStream); // warm-up (no se mide)
    const samples = [];
    for (let i = 0; i < 3; i += 1) {
      const start = Date.now();
      const r = await liveStreamClient.scheduleJobs(liveStream);
      const elapsed = Date.now() - start;
      expect(r.ok(), `GET schedules fallo en muestra ${i + 1}: ${r.status()}`).toBeTruthy();
      samples.push(elapsed);
    }
    samples.sort((a, b) => a - b);
    const median = samples[1];
    expect(median, `mediana de 3 GET schedules: ${samples.join(',')} ms (limite 5000ms)`).toBeLessThan(5000);
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

  // ═══════════════════════════════════════════════════════════════════════
  // 5. GET /schedule/:sid (sm2#8496) — endpoint distinto de /schedule-job/:sid
  // El handler EventSchedule.find() devuelve un array. Antes del fix la rama
  // if(schedule) trataba [] como truthy -> 200 con data:[] en lugar de 404.
  // ═══════════════════════════════════════════════════════════════════════

  test('GET /schedule/:sid con sid valido y vigente responde 200 con data[] @LIVE-TC-124', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // SKIP tecnico: el handler /schedule/:sid consulta el modelo EventSchedule
    // (distinto de EventScheduleJob que crea createScheduleJob). EventSchedule
    // es materializado por el scheduler del backend a partir de un
    // schedule-job, y AQ2 no tiene forma de dispararlo deterministicamente en
    // un test self-contained (no hay endpoint API para crear EventSchedule
    // directamente, ni listar los existentes para reusarlos — la convencion
    // del modulo es no reusar datos de dev). Verificado en vivo: tras crear
    // un schedule onetime futuro, GET /schedule/:sid con su _id devuelve 404
    // porque el scheduler aun no materializo el EventSchedule correspondiente.
    // El happy path del fix queda entonces cubierto por la cobertura manual
    // (existen EventSchedules materializados en dev que se pueden consultar)
    // y por los TC-125/126 que prueban los casos del bug que el fix arregla.
    test.skip(true, 'EventSchedule lo materializa el scheduler; no hay API para crearlo self-contained');

    const day = dayStr(40);
    const created = await liveStreamClient.createScheduleJob(
      liveStream,
      onetime('QA detail schedule', day, 10, 12)
    );
    expect(created.status()).toBe(200);
    const sid = (await created.json()).data._id;

    const r = await liveStreamClient.schedule(liveStream, sid);
    expect(r.status(), `happy path devolvio ${r.status()}`).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('OK');
    expect(Array.isArray(body.data), 'data debe ser array').toBeTruthy();
    expect(body.data.length, 'data no debe estar vacio en el happy path').toBeGreaterThan(0);
    expect(body.data[0]._id).toBe(sid);
  });

  test('GET /schedule/:sid con sid inexistente responde 404 NOT_FOUND [sm2#8496] @LIVE-TC-125', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const r = await liveStreamClient.schedule(liveStream, '000000000000000000000099');
    expect(
      r.status(),
      `sid inexistente devolvio ${r.status()} (debe ser 404; antes del fix era 200 con data:[])`
    ).toBe(404);
    const body = await r.json();
    expect(body.status).toBe('ERROR');
    expect(body.data).toBe('NOT_FOUND');
  });

  test('GET /schedule/:sid con schedule expirado responde 404 NOT_FOUND [sm2#8496] @LIVE-TC-126', async ({
    liveStreamClient,
    liveStream,
  }) => {
    // El server acepta date_end en el pasado (bug AQ2#18, prueba viva LIVE-TC-11),
    // asi que podemos crear uno y luego verificar que el detail responde 404.
    const created = await liveStreamClient.createScheduleJob(
      liveStream,
      onetime('QA detail expired', '2020-01-01', 10, 12)
    );
    expect(created.status()).toBe(200);
    const sid = (await created.json()).data._id;

    const r = await liveStreamClient.schedule(liveStream, sid);
    expect(
      r.status(),
      `schedule expirado devolvio ${r.status()} (debe ser 404; antes del fix era 200 con data:[])`
    ).toBe(404);
    const body = await r.json();
    expect(body.status).toBe('ERROR');
    expect(body.data).toBe('NOT_FOUND');
  });

  test('GET /schedule/:sid sin token responde 401 o 403 @LIVE-TC-127', async ({
    liveStream,
    playwright,
  }) => {
    const unauth = await playwright.request.newContext({ baseURL: env.baseURL });
    try {
      const r = await unauth.get(
        `/api/live-stream/${liveStream}/schedule/000000000000000000000099`
      );
      expect(
        [401, 403].includes(r.status()),
        `GET sin token devolvio ${r.status()} (deberia ser 401/403)`
      ).toBeTruthy();
    } finally {
      await unauth.dispose();
    }
  });
});