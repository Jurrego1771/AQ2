// @ts-check
const { test, expect } = require('../../src/fixtures');
const { env } = require('../../src/utils/env');

/**
 * API — Schedules de Live Stream (@api @live-stream).
 *
 * Cada test es self-contained: el fixture `liveStream` crea un evento por API y
 * lo borra al terminar (sus schedules se borran en cascada). Verde = contrato
 * correcto protegido; test.fail() = prueba viva de un bug conocido.
 *
 * Contrato verificado en vivo (dev) — create POST /schedule-job/, update POST
 * /schedule-job/:id, GET por defecto filtra date_end>=now (usar all=true).
 */

// Fechas derivadas de "ahora" (no hardcodear; CLAUDE.md). Formato YYYY-MM-DD UTC.
const dayStr = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Payload onetime con ventana [startHour, endHour) el mismo día. */
const onetime = (name, dateDay, startHour, endHour) => ({
  name,
  type: 'onetime',
  date_start: dateDay,
  date_end: dateDay,
  date_start_hour: startHour,
  date_start_minute: 0,
  date_end_hour: endHour,
  date_end_minute: 0,
  tz_offset: 0,
  for_recording: false,
});

test.describe('Live Stream schedules — contrato API @api @live-stream', () => {
  // Estos tests CREAN recursos (lives/schedules) -> no se ejecutan contra prod.
  // El skip va en beforeEach sin tocar el fixture liveStream, así el evento ni
  // siquiera se crea en prod (el fixture es lazy: no se instancia si se skipea).
  test.beforeEach(() => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)');
  });

  test('crear un schedule onetime válido persiste y es consultable por API @LIVE-TC-8', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const day = dayStr(30);
    const res = await liveStreamClient.createScheduleJob(liveStream, onetime('QA onetime', day, 10, 12));
    expect(res.status()).toBe(200);
    const created = (await res.json()).data;
    expect(created.type).toBe('onetime');
    expect(created.is_future).toBe(true);

    // Consultable por API con todos sus campos (all=true incluye futuros).
    const list = await liveStreamClient.scheduleJobs(liveStream, { all: 'true' });
    expect(list.status()).toBe(200);
    const items = (await list.json()).data;
    const found = items.find((s) => s._id === created._id);
    expect(found, 'el schedule creado debe aparecer en el listado').toBeTruthy();
    // Campos del contrato presentes.
    for (const field of ['name', 'type', 'date_start', 'date_end', 'is_featured', 'is_blackout']) {
      expect(found).toHaveProperty(field);
    }
  });

  test('crear un schedule recurrente válido (<=1 año) persiste la recurrencia @LIVE-TC-9', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const res = await liveStreamClient.createScheduleJob(liveStream, {
      name: 'QA recurrent',
      type: 'recurrent',
      date_start: dayStr(10),
      date_end: dayStr(60), // dentro de 1 año
      date_start_hour: 0,
      date_start_minute: 0,
      date_end_hour: 0,
      date_end_minute: 0,
      tz_offset: 0,
      recurrency: { days: 'monday,tuesday', start_hour: 10, start_minute: 0, duration_hours: 1, duration_minutes: 0 },
    });
    expect(res.status()).toBe(200);
    const created = (await res.json()).data;
    expect(created.type).toBe('recurrent');
    expect(created.recurrency).toMatchObject({ days: 'monday,tuesday', duration: 3600 });
  });

  test('un schedule recurrente que excede 1 año es rechazado (400) @LIVE-TC-10', async ({
    liveStreamClient,
    liveStream,
  }) => {
    const res = await liveStreamClient.createScheduleJob(liveStream, {
      name: 'QA recurrent >1y',
      type: 'recurrent',
      date_start: dayStr(10),
      date_end: dayStr(400), // > 1 año
      date_start_hour: 0,
      date_start_minute: 0,
      date_end_hour: 0,
      date_end_minute: 0,
      tz_offset: 0,
      recurrency: { days: 'monday', start_hour: 10, start_minute: 0, duration_hours: 1, duration_minutes: 0 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).data).toBe('INVALID_DATE_ERROR_OVER_MAX_DURATION');
  });

  // --- Prueba viva del bug #18: schedule con fin en el pasado ---
  test('un schedule onetime con fecha de fin en el pasado debe rechazarse [BUG #18] @LIVE-TC-11', async ({
    liveStreamClient,
    liveStream,
  }) => {
    test.fail(
      true,
      'BUG #18: el server acepta date_end en el pasado (200) — https://github.com/Jurrego1771/AQ2/issues/18'
    );
    const res = await liveStreamClient.createScheduleJob(liveStream, onetime('QA past', '2020-01-01', 10, 12));
    expect(res.status(), 'un fin en el pasado no debería crear el schedule').toBeGreaterThanOrEqual(400);
  });

  // --- Prueba viva del bug #19: solape devuelve 500 en vez de 400 ---
  test('crear un schedule que solapa otro debe responder 400, no 500 [BUG #19] @LIVE-TC-12', async ({
    liveStreamClient,
    liveStream,
  }) => {
    test.fail(
      true,
      'BUG #19: el solape responde 500 en vez de 400 — https://github.com/Jurrego1771/AQ2/issues/19'
    );
    const day = dayStr(45);
    const first = await liveStreamClient.createScheduleJob(liveStream, onetime('QA base', day, 10, 12));
    expect(first.status()).toBe(200);
    const overlap = await liveStreamClient.createScheduleJob(liveStream, onetime('QA overlap', day, 11, 13));
    expect(overlap.status(), 'un solape es error del cliente -> 400').toBe(400);
  });

  // --- Song metadata: solo aplica a lives de AUDIO (PR sm2#8463) ---
  // El contrato persiste ambos flags, incluidos los valores false (a diferencia
  // del bug #23 en description/is_featured). Verificado en vivo (dev v7.0.70).

  test('audio: crear schedule persiste inherit_ignore_song_metadata=false e ignoreSongMetadata=true @LIVE-TC-16', async ({
    liveStreamClient,
    audioLiveStream,
  }) => {
    const day = dayStr(55);
    const res = await liveStreamClient.createScheduleJob(audioLiveStream, {
      ...onetime('QA songmeta create', day, 10, 12),
      inherit_ignore_song_metadata: false,
      ignoreSongMetadata: true,
    });
    expect(res.status()).toBe(200);
    const sid = (await res.json()).data._id;

    const after = (await (await liveStreamClient.scheduleJob(audioLiveStream, sid)).json()).data;
    expect(after.inherit_ignore_song_metadata, 'inherit=false debe persistir (falsy)').toBe(false);
    expect(after.ignoreSongMetadata, 'ignore=true debe persistir').toBe(true);
  });

  test('audio: update alterna song metadata y persiste el valor false @LIVE-TC-17', async ({
    liveStreamClient,
    audioLiveStream,
  }) => {
    const day = dayStr(58);
    const base = onetime('QA songmeta upd', day, 10, 12);
    // add: inherit=false, ignore=true
    const created = await liveStreamClient.createScheduleJob(audioLiveStream, {
      ...base,
      inherit_ignore_song_metadata: false,
      ignoreSongMetadata: true,
    });
    const sid = (await created.json()).data._id;

    // modify + clear-a-false: inherit=true, ignore=false (el false es el caso frágil)
    const upd = await liveStreamClient.updateScheduleJob(audioLiveStream, sid, {
      ...base,
      inherit_ignore_song_metadata: true,
      ignoreSongMetadata: false,
    });
    expect(upd.status()).toBe(200);

    const after = (await (await liveStreamClient.scheduleJob(audioLiveStream, sid)).json()).data;
    expect(after.inherit_ignore_song_metadata, 'inherit=true debe persistir').toBe(true);
    expect(after.ignoreSongMetadata, 'ignore=false (falsy) debe persistir, no ignorarse').toBe(false);
  });

  // --- Prueba viva del bug #23: el vaciado no persiste en update ---
  test('vaciar la descripción y apagar is_featured en update debe persistir [BUG #23] @LIVE-TC-13', async ({
    liveStreamClient,
    liveStream,
  }) => {
    test.fail(
      true,
      'BUG #23: el update ignora valores vacíos/false — https://github.com/Jurrego1771/AQ2/issues/23'
    );
    const day = dayStr(50);
    const base = onetime('QA upd', day, 10, 12);
    const createRes = await liveStreamClient.createScheduleJob(liveStream, {
      ...base,
      description: 'INITIAL',
      is_featured: true,
    });
    expect(createRes.status()).toBe(200);
    const sid = (await createRes.json()).data._id;

    const updRes = await liveStreamClient.updateScheduleJob(liveStream, sid, {
      ...base,
      description: '',
      is_featured: false,
    });
    expect(updRes.status()).toBe(200); // el update responde OK (falsa sensación de guardado)

    const after = (await (await liveStreamClient.scheduleJob(liveStream, sid)).json()).data;
    expect(after.description, 'la descripción vaciada debe persistir').toBe('');
    expect(after.is_featured, 'is_featured apagado debe persistir').toBe(false);
  });
});
