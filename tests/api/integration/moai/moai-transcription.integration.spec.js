// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');

/**
 * @api @moai — Transcripción de audio con IA (Deepgram/Whisper), US-037.
 *
 * Ejemplo canónico de QA de IA no-determinista: se aserta el CONTRATO del disparo
 * (acepta el trabajo, devuelve jobId, es async), NUNCA el texto transcrito.
 *
 * Contrato verificado en vivo 2026-07-14:
 *   POST /api/media/:id/transcription
 *     - media inexistente        -> 404 MEDIA_NOT_FOUND        (determinista)
 *     - media transcodificado    -> 200 {data:'TRANSCRIPTION_PROCESSING', jobId}  (async)
 *
 * El media de audio lo provee el fixture `aiAudioMedia` (ingesta remota del
 * QA_SAMPLE_AUDIO_URL + gate de transcoding), self-contained.
 */
test.describe('MoAI — transcripción de audio @api @moai', () => {
  test.skip(env.isProd, 'no se dispara transcripción contra prod (prodGuard)');

  // ── Validación determinista (sin media, barata) ──
  test('transcription sobre un media inexistente responde 404 @MOAI-TC-9', async ({ api }) => {
    const res = await api.post('/api/media/000000000000000000000000/transcription', { data: {} });
    expect(res.status(), `esperado 404, obtenido ${res.status()}`).toBe(404);
    const body = await res.json();
    expect(body.data).toBe('MEDIA_NOT_FOUND');
  });

  // ── Invocación IA VIVA — contrato del disparo, no el contenido ──
  // Sube audio + espera transcoding + dispara Deepgram/Whisper. Async y con costo.
  test('disparar transcripción de un audio devuelve el contrato async (jobId) @MOAI-TC-10', async ({ api, aiAudioMedia }) => {
    test.skip(!!process.env.QA_SKIP_AI_LIVE, 'QA_SKIP_AI_LIVE: se omite la invocación IA viva');
    test.setTimeout(150_000); // ingesta + transcoding + disparo

    const res = await api.post(`/api/media/${aiAudioMedia}/transcription`, { data: {} });
    expect(res.status(), `transcription: ${res.status()}`).toBe(200);

    // CONTRATO del disparo async (NO se aserta el texto transcrito):
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(body.data).toBe('TRANSCRIPTION_PROCESSING');
    expect(typeof body.jobId === 'string' && body.jobId.length, 'jobId de transcripción').toBeTruthy();
  });
});
