// @ts-check
const { runRtmpSend, isAvailable } = require('../utils/ffmpeg');
const { qaName } = require('../utils/qa-name');

/**
 * Factory self-contained: crea un live-stream, configura MediaLive RTMP_PUSH,
 * resuelve la URL RTMP, lanza ffmpeg con senal sintetica (testsrc + sine) y
 * devuelve un handle con utilidades para el spec.
 *
 * Patron adaptado de D:\ffmpeg-assist\publish_rtmp_to_medialive.py al
 * entorno JS de AQ2 (storageState session + ResourceCleaner + fixture pattern).
 *
 * Resiliencia:
 *  - Si MediaLive NO esta habilitado para esta cuenta (PATCH /api/live-stream/:id
 *    con medialive.* devuelve 401/403/404), cae al legacy publishing URL
 *    `entry_points.primary[0]` que el server expone por defecto. Asi el fixture
 *    sigue siendo util para detectar "live esta online" aunque no haya
 *    cloud transcoding.
 *  - Si ffmpeg no esta en PATH, la factory lanza un error explicito (los specs
 *    pueden usar `isAvailable()` para skipear).
 *
 * Lifecycle:
 *   const handle = await createLiveSignal(api, { name, durationSec: 30 });
 *   await handle.start();             // crea live, habilita ML, lanza ffmpeg
 *   await handle.waitForOnline(60_000); // opcional: espera a que llegue senal
 *   expect(await handle.isOnline()).toBe(true);
 *   await handle.stop();              // mata ffmpeg + apaga ML + borra live
 *
 * Si `start()` falla a mitad de camino, `stop()` igual hace best-effort cleanup.
 * Si el caller no llama stop (test crashea), el ffmpeg queda huerfano y la
 * garbage collection del OS lo limpia al cabo de `-t durationSec` segundos
 * (porque runRtmpSend pasa `-t` a ffmpeg). El live-stream se borrara en el
 * siguiente sweep global o test run.
 *
 * @param {import('@playwright/test').APIRequestContext} api
 * @param {object} [opts]
 * @param {string} [opts.name]                 Nombre del live (default: qaName()).
 * @param {'video'|'audio'} [opts.type]        Tipo de live (default: 'video').
 * @param {number} [opts.durationSec=20]       Cuanto envia ffmpeg antes de cortarse solo.
 * @param {object} [opts.medialive]            Override de la config medialive inicial.
 *   @param {boolean} [opts.medialive.enabled=true]
 *   @param {string} [opts.medialive.inputsType='RTMP_PUSH']
 * @param {object} [opts.encodingProfile]      Rendition a configurar. Default 720p.
 * @param {boolean} [opts.verbose=false]       Loguea ffmpeg stderr si true.
 * @returns {Promise<import('./live-signal-factory').LiveSignalHandle>}
 */
async function createLiveSignal(api, opts = {}) {
  const {
    name,
    type = 'video',
    durationSec = 20,
    medialive = { enabled: true, inputsType: 'RTMP_PUSH' },
    encodingProfile = {
      enabled: true,
      profile: '720p',
      video_bitrate: 2_500_000,
      audio_bitrate: 128_000,
      audio_codec: 'mp4a.40.2',
      video_codec: 'avc1.42001f',
      resolution: { width: 1280, height: 720 },
      recording: false,
    },
    verbose = false,
  } = opts;

  if (!(await isAvailable())) {
    throw new Error(
      'createLiveSignal: ffmpeg no esta en PATH. Instalar ffmpeg o skipear el spec con isAvailable().'
    );
  }

  const liveName = name || qaName({ type: type === 'audio' ? 'AudioLive' : 'Live', withTs: true });

  // --- estado interno (todo se llena en start()) ---
  /** @type {string|null} */
  let liveId = null;
  /** @type {string|null} */
  let rtmpUrl = null;
  /** @type {import('node:child_process').ChildProcess|null} */
  let ffmpegProc = null;
  let started = false;
  let stopped = false;
  /** @type {'medialive'|'legacy'|null} */
  let rtmpSource = null;

  /** Lee el documento del live. Retorna body.data (o null si falla). */
  async function fetchLive() {
    const res = await api.get(`/api/live-stream/${liveId}`);
    if (!res.ok()) return null;
    const body = await res.json().catch(() => ({}));
    return body?.data ?? body;
  }

  /** Habilita MediaLive + configura rendition. Best-effort: loguea y sigue. */
  async function enableMediaLive() {
    if (!medialive?.enabled) return;
    const payload = {
      medialive: {
        enabled: true,
        inputsType: medialive.inputsType || 'RTMP_PUSH',
        useBackup: false,
        jobEnabled: true,
        region: 'us-east-1',
      },
      encodingProfiles: [
        {
          enabled: true,
          profile: encodingProfile.profile,
          video_bitrate: encodingProfile.video_bitrate,
          audio_bitrate: encodingProfile.audio_bitrate,
          audio_codec: encodingProfile.audio_codec,
          video_codec: encodingProfile.video_codec,
          resolution: {
            width: encodingProfile.resolution.width,
            height: encodingProfile.resolution.height,
          },
          recording: encodingProfile.recording,
        },
      ],
    };
    const res = await api.post(`/api/live-stream/${liveId}`, payload);
    if (!res.ok()) {
      // eslint-disable-next-line no-console
      console.warn(
        `[live-signal] enable medialive fallo: HTTP ${res.status()} ${(await res.text()).slice(0, 200)} ` +
          `- cae a entry_points.primary`
      );
    }
  }

  /** Apaga MediaLive sin borrar el live. Best-effort. */
  async function disableMediaLive() {
    if (!liveId) return;
    const res = await api.post(`/api/live-stream/${liveId}`, {
      medialive: { jobEnabled: false, enabled: false },
    });
    if (!res.ok()) {
      // eslint-disable-next-line no-console
      console.warn(`[live-signal] disable medialive fallo: HTTP ${res.status()}`);
    }
  }

  /** Borra el live-stream. Best-effort (no falla el teardown si ya no existe). */
  async function deleteLive() {
    if (!liveId) return;
    const res = await api.delete(`/api/live-stream/${liveId}`);
    if (!res.ok() && res.status() !== 404) {
      // eslint-disable-next-line no-console
      console.warn(`[live-signal] delete live fallo: HTTP ${res.status()}`);
    }
    liveId = null;
  }

  /** Construye el RTMP URL desde inputs[0] (MediaLive) o entry_points.primary (legacy). */
  function buildRtmpUrl(data) {
    const ml = data?.medialive || {};
    const ch = ml.channel || {};
    const inputs = ch.inputs || [];
    if (inputs.length) {
      const inp = inputs[0];
      const endpoint = (inp.endpoint || '').replace(/\/$/, '');
      const streamKey = inp.streamKey || '';
      if (endpoint && streamKey) {
        return { url: `${endpoint}/${streamKey}`, source: 'medialive' };
      }
    }
    const eps = (data?.entry_points || {}).primary || [];
    if (eps.length) {
      const ep = eps[0];
      const baseUrl = ep.url || '';
      const pubToken = data.publishing_token;
      if (baseUrl) {
        const url =
          pubToken && !baseUrl.includes('token=')
            ? `${baseUrl}?token=${pubToken}`
            : baseUrl;
        return { url, source: 'legacy' };
      }
    }
    return null;
  }

  /** @type {import('./live-signal-factory').LiveSignalHandle} */
  const handle = {
    /** @returns {string|null} */
    get liveId() {
      return liveId;
    },
    /** @returns {string|null} */
    get rtmpUrl() {
      return rtmpUrl;
    },
    /** @returns {'medialive'|'legacy'|null} */
    get rtmpSource() {
      return rtmpSource;
    },
    /** @returns {import('node:child_process').ChildProcess|null} */
    get ffmpeg() {
      return ffmpegProc;
    },

/**
   * Pipeline completo:
   *  1. POST /api/live-stream/         crea el evento
   *  2. POST /api/live-stream/:id     habilita MediaLive (best-effort)
   *  3. GET /api/live-stream/:id      una sola vez -> extrae RTMP URL
   *     de medialive.channel.inputs[0] o entry_points.primary[0]
   *  4. spawn ffmpeg testsrc + sine contra esa URL con `-t durationSec`
   *
   * Sin polling bloqueante: si el server no expone el RTMP URL inmediatamente
   * (MediaLive tarda en aprovisionar), falla rapido con error claro. Los specs
   * que necesiten esperar mas pueden usar `handle.waitForRtmpUrl()` con su
   * propio timeout fuera del fixture.
   *
   * Idempotente: si ya esta started, no hace nada.
   */
  async start() {
    if (started) return handle;
    if (stopped) throw new Error('createLiveSignal: handle ya fue stop()eado');

    // 1. crear el live
    const createRes = await api.post('/api/live-stream/', {
      data: { name: liveName, type },
    });
    if (!createRes.ok()) {
      throw new Error(
        `createLiveSignal: POST /api/live-stream/ fallo: HTTP ${createRes.status()} ${await createRes.text()}`
      );
    }
    const createBody = await createRes.json();
    liveId = createBody?.data?._id || createBody?.data?.id;
    if (!liveId) {
      throw new Error(
        `createLiveSignal: respuesta sin _id: ${JSON.stringify(createBody).slice(0, 200)}`
      );
    }

    // 2. habilitar MediaLive (best-effort)
    await enableMediaLive();

    // 3. una sola lectura: si no aparece RTMP URL ya, fallamos rapido
    const data = await fetchLive();
    const built = data ? buildRtmpUrl(data) : null;
    if (!built) {
      await deleteLive();
      const keys = data ? Object.keys(data).join(',') : 'null';
      throw new Error(
        `createLiveSignal: no se encontro RTMP URL (medialive.inputs[0] ni entry_points.primary[0]). ` +
          `live keys=${keys}. ` +
          `Si MediaLive no esta habilitado en esta cuenta, el server debe exponer entry_points.primary por defecto.`
      );
    }
    rtmpUrl = built.url;
    rtmpSource = built.source;

    // 4. lanzar ffmpeg
    ffmpegProc = spawnFfmpeg(rtmpUrl, encodingProfile, durationSec, verbose);
    started = true;
    return handle;
  },

  /**
   * Polea GET /api/live-stream/:id hasta que aparezca RTMP URL (util cuando
   * MediaLive tarda en provisionar el channel). Devuelve el URL o null si
   * se agota el timeout.
   * @param {number} [timeoutMs=90_000]
   */
  async waitForRtmpUrl(timeoutMs = 90_000) {
    if (rtmpUrl) return rtmpUrl;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const data = await fetchLive();
      const built = data ? buildRtmpUrl(data) : null;
      if (built) {
        rtmpUrl = built.url;
        rtmpSource = built.source;
        // Si todavia no lanzamos ffmpeg, lo lanzamos ahora.
        if (!ffmpegProc) {
          ffmpegProc = spawnFfmpeg(rtmpUrl, encodingProfile, durationSec, verbose);
          started = true;
        }
        return rtmpUrl;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  },

    /**
     * Devuelve true si el live aparece como online (campo `online` truthy).
     * Lectura puntual (no espera).
     */
    async isOnline() {
      if (!liveId) return false;
      const data = await fetchLive();
      if (!data) return false;
      return Boolean(data.online);
    },

    /**
     * Polea hasta que live.online === true (o false para probar el negativo).
     * @param {number} [timeoutMs=30_000]
     * @param {boolean} [wantOnline=true]
     * @returns {Promise<boolean>} true si se logro la condicion.
     */
    async waitForOnline(timeoutMs = 30_000, wantOnline = true) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if ((await handle.isOnline()) === wantOnline) return true;
        await new Promise((r) => setTimeout(r, 1500));
      }
      return false;
    },

    /**
     * Cleanup best-effort: mata ffmpeg -> apaga MediaLive -> borra live.
     * Idempotente. No lanza.
     */
    async stop() {
      if (stopped) return;
      stopped = true;
      if (ffmpegProc) {
        try {
          ffmpegProc.kill('SIGTERM');
          const exited = await Promise.race([
            new Promise((res) => ffmpegProc.once('exit', res)),
            new Promise((res) => setTimeout(() => res(false), 3000)),
          ]);
          if (exited === false && ffmpegProc.exitCode === null) {
            ffmpegProc.kill('SIGKILL');
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[live-signal] ffmpeg kill error: ${e?.message || e}`);
        }
        ffmpegProc = null;
      }
      await disableMediaLive();
      await deleteLive();
    },
  };

  return handle;
}

/**
 * Lanza ffmpeg con testsrc + sine como fuente, encode libx264/aac, push FLV/RTMP.
 * Variante del helper generico `runRtmpSend` que tambien emite audio (la senal
 * "real" de un live suele incluir tono de prueba, asi MediaLive la clasifica
 * como stream valido).
 *
 * @returns {import('node:child_process').ChildProcess}
 */
function spawnFfmpeg(rtmpUrl, profile, durationSec, verbose) {
  const w = profile?.resolution?.width || 1280;
  const h = profile?.resolution?.height || 720;
  const v = profile?.video_bitrate || 2_500_000;
  const a = profile?.audio_bitrate || 128_000;

  const args = [
    '-hide_banner',
    '-loglevel', verbose ? 'info' : 'error',
    '-y',
    '-re',
    '-f', 'lavfi',
    '-i', `testsrc2=size=${w}x${h}:rate=30,format=yuv420p`,
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:sample_rate=44100',
    '-t', String(durationSec),
    '-c:v', 'libx264',
    '-profile:v', 'high', '-level:v', '4.0',
    '-pix_fmt', 'yuv420p',
    '-b:v', String(v), '-minrate', String(v), '-maxrate', String(v),
    '-bufsize', String(v * 2),
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-g', '60',
    '-c:a', 'aac', '-profile:a', 'aac_low',
    '-b:a', String(a), '-ar', '44100', '-ac', '2',
    '-f', 'flv',
    rtmpUrl,
  ];

  // eslint-disable-next-line global-require
  const { spawn } = require('node:child_process');
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stderr.on('data', (chunk) => {
    if (verbose && process.env.DEBUG_FFMPEG) {
      process.stderr.write(`[ffmpeg] ${chunk}`);
    }
  });
  proc.on('error', (e) => {
    // eslint-disable-next-line no-console
    console.warn(`[ffmpeg] error: ${e?.message || e}`);
  });
  return proc;
}

module.exports = { createLiveSignal };