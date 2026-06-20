// @ts-check

/**
 * Aprovisionamiento de media por API (sin Resumable): ingesta remota desde una
 * URL pública. El server descarga y transcodifica. Patrón aprendido del flujo
 * real de SM2 (GET /api/media/upload?type=remote).
 *
 * Flujo:
 *  1. GET /api/media/upload?type=remote&fileUrl=... -> { jobId }
 *  2. el media creado lleva el jobId como prefijo del título -> resolver _id
 *  3. poll hasta que una rendition (meta) llegue a OK -> gate de transcoding
 *
 * Todas las llamadas usan el APIRequestContext autenticado por sesión
 * (storageState del login).
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Lanza la ingesta remota. @returns {Promise<string>} jobId */
async function startRemoteIngest(api, { fileUrl, fileName, genre = 'movie' }) {
  const params = new URLSearchParams({
    type: 'remote',
    fileUrl,
    file_name: fileName,
    genre,
    size: '1024',
  })
  const res = await api.get(`/api/media/upload?${params.toString()}`)
  if (!res.ok()) throw new Error(`ingesta remota falló: HTTP ${res.status()}`)
  const body = await res.json()
  const jobId = body?.data?.jobId
  if (!jobId) throw new Error(`ingesta remota sin jobId: ${JSON.stringify(body)}`)
  return jobId
}

/** Resuelve el _id del media cuyo título contiene el jobId. */
async function resolveMediaId(api, jobId, { timeoutMs = 30_000, intervalMs = 2_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await api.get(
      '/api/media?admin=true&all=true&limit=10&sort=-date_created&lite=true'
    )
    if (res.ok()) {
      const { data = [] } = await res.json()
      const found = data.find((m) => (m.title || '').includes(jobId))
      if (found) return found._id
    }
    await sleep(intervalMs)
  }
  throw new Error(`el media del job ${jobId} no apareció en ${timeoutMs}ms`)
}

/**
 * Gate de transcoding: espera a que al menos una rendition esté OK. Si no ocurre
 * dentro del timeout, es un fallo de transcoding (también un hallazgo de calidad).
 */
async function waitForTranscoding(api, id, { timeoutMs = 120_000, intervalMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastStatuses = []
  while (Date.now() < deadline) {
    const res = await api.get(`/api/media/${id}`)
    if (res.ok()) {
      const body = await res.json()
      const metas = (body.data || body).meta || []
      lastStatuses = metas.map((m) => m.status)
      if (lastStatuses.some((s) => s === 'OK')) return
    }
    await sleep(intervalMs)
  }
  throw new Error(
    `transcoding no completó en ${timeoutMs}ms (renditions: ${JSON.stringify(lastStatuses)})`
  )
}

/**
 * Crea un media listo para usar y devuelve su id. El llamador debe registrarlo
 * en el ResourceCleaner para el teardown.
 * @returns {Promise<string>}
 */
async function createTranscodedMedia(
  api,
  { fileUrl, fileName, genre = 'movie', waitTranscoding = true } = {}
) {
  const jobId = await startRemoteIngest(api, { fileUrl, fileName, genre })
  const id = await resolveMediaId(api, jobId)
  if (waitTranscoding) await waitForTranscoding(api, id)
  return id
}

module.exports = { createTranscodedMedia, startRemoteIngest, resolveMediaId, waitForTranscoding }
