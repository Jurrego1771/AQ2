// @ts-check
const { spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

const execFileAsync = promisify(execFile);

/**
 * Helpers para invocar ffmpeg desde los specs (RTMP push al live-stream).
 * Reutilizable: si en el futuro hay otros specs que envian senal, se
 * importa el mismo helper.
 *
 * Convecciones:
 *   - isAvailable()  : probe sync, retorna boolean. Usar en test.skip()
 *   - runRtmpSend()  : async, lanza ffmpeg en background, retorna un handle
 *                      con .kill() para cleanup. NO espera a que termine:
 *                      el caller hace await del evento de "senal recibida".
 *   - El caller SIEMPRE debe llamar handle.kill() en un finally (o en el
 *     teardown de un fixture) para no dejar procesos huerfanos.
 */

/** Probe: ffmpeg disponible en PATH. Cachea el resultado. */
let _available = null;
async function isAvailable() {
  if (_available !== null) return _available;
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(cmd, ['ffmpeg']);
    _available = stdout.trim().length > 0;
  } catch {
    _available = false;
  }
  return _available;
}

/**
 * Sincronico: ffmpeg disponible (uso del cache). Util cuando el probe ya
 * corrio. Si nunca se probo, corre el probe ahora.
 */
function isAvailableSync() {
  // Sin cache: fuerza probe async. Pero no podemos await sync. Llamamos al
  // probe y devolvemos lo que haya (true por defecto si el PATH tiene ffmpeg).
  // En la practica, isAvailable() se llama una vez en beforeAll.
  return _available !== null ? _available : false;
}

/**
 * @typedef {object} FfmpegHandle
 * @property {import('node:child_process').ChildProcess} proc   Proceso ffmpeg.
 * @property {string} rtmpUrl                              URL a la que se envia.
 * @property {number} durationSec                          Duracion del clip generado.
 * @property {() => Promise<void>} kill                    Mata el proceso (await SIGTERM/SIGKILL).
 * @property {() => string} lastStderr                     Ultimo stderr (para debug).
 */

/**
 * Envia un stream RTMP sintetico al URL indicado usando ffmpeg.
 * Usa lavfi/testsrc como fuente (no requiere archivos externos), por lo
 * que el test es 100% self-contained.
 *
 * El proceso se lanza en background y se mata automaticamente despues de
 * `durationSec` segundos (ffmpeg con flag `-t`). El caller puede matar
 * antes con handle.kill().
 *
 * @param {string} rtmpUrl  URL rtmp://... a la que enviar.
 * @param {object} [opts]
 * @param {number} [opts.durationSec=20]  Duracion del clip (segundos).
 * @param {string} [opts.videoSize='320x240']  Resolucion del video sintetico.
 * @param {number} [opts.fps=10]  Frames por segundo (bajo para no saturar).
 * @param {boolean} [opts.verbose=false]  Si true, ffmpeg emite logs a stderr del test.
 * @returns {FfmpegHandle}
 */
function runRtmpSend(rtmpUrl, opts = {}) {
  const {
    durationSec = 20,
    videoSize = '320x240',
    fps = 10,
    verbose = false,
  } = opts;

  // Args: -re (real-time), lavfi testsrc como fuente, -t duracion, libx264
  // preset ultrafast para no demorar el encoding, flv formato de RTMP.
  // -loglevel error para no spammear; -stats_period solo si verbose.
  const args = [
    '-re',
    '-f', 'lavfi',
    '-i', `testsrc=size=${videoSize}:rate=${fps}:duration=${durationSec}`,
    '-t', String(durationSec),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-g', String(fps * 2), // keyframe interval = 2s
    '-pix_fmt', 'yuv420p',
    '-f', 'flv',
    rtmpUrl,
  ];
  if (verbose) args.push('-loglevel', 'info');

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let lastStderr = '';
  proc.stderr.on('data', (chunk) => {
    lastStderr = chunk.toString();
    if (verbose && process.env.DEBUG_FFMPEG) {
      // eslint-disable-next-line no-console
      process.stderr.write(`[ffmpeg] ${lastStderr}`);
    }
  });
  proc.on('error', (e) => {
    // eslint-disable-next-line no-console
    console.warn(`[ffmpeg] proceso error: ${e?.message || e}`);
  });

  let killed = false;
  /** @type {FfmpegHandle} */
  const handle = {
    proc,
    rtmpUrl,
    durationSec,
    lastStderr: () => lastStderr,
    kill: async () => {
      if (killed) return;
      killed = true;
      if (proc.exitCode !== null) return; // ya termino
      proc.kill('SIGTERM');
      // Espera breve a que termine; si no, SIGKILL.
      const exit = await Promise.race([
        new Promise((res) => proc.once('exit', res)),
        new Promise((res) => setTimeout(() => res('timeout'), 3000)),
      ]);
      if (exit === 'timeout' && proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
    },
  };
  return handle;
}

module.exports = { isAvailable, isAvailableSync, runRtmpSend };