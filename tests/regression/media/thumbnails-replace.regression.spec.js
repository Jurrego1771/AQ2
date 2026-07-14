// @ts-check
const crypto = require('crypto')
const { test, expect } = require('../../../src/fixtures')
const { env } = require('../../../src/utils/env')
const { spriteUrlsFromThumb } = require('../../../src/utils/sprite')

/**
 * Regresión — Thumbnails: replace de media actualiza imágenes derivadas
 * (@regression @thumbnails). Comportamiento validado en vivo contra dev.
 *
 * Al reemplazar el video de un media (mismo media_id), los thumbnails generados
 * deben regenerarse (THM-TC-5, verde) y el sprite/VTT de timeline también
 * (THM-TC-6, hoy en rojo por el bug #16 → prueba viva test.fail).
 *
 * Pesado: cada test crea un media (transcoding) y lo reemplaza (2º transcoding).
 */

// Vídeo de reemplazo distinto al del fixture (que usa 133165-755982945_tiny.mp4).
const REPLACEMENT_VIDEO =
  process.env.QA_REPLACE_VIDEO_URL ||
  'https://cdn.pixabay.com/video/2022/06/24/121985-724732208_tiny.mp4'

/** metaId embebido en el nombre de un thumb generado: thumb_<media>_<meta>_<n>s.jpg */
function thumbMetaId(name) {
  return /^thumb_[0-9a-f]{24}_([0-9a-f]{24})_/.exec(name || '')?.[1] || null
}

async function getMedia(api, id) {
  const res = await api.get(`/api/media/${id}`)
  return (await res.json()).data
}

async function getThumbs(api, id) {
  const res = await api.get(`/api/media/${id}/thumbs`)
  return res.ok() ? (await res.json()).data?.thumbnails || [] : []
}

/** Conjunto de metaIds del media (renditions). */
function metaIdSet(media) {
  return new Set((media.meta || []).map((m) => String(m._id || m)))
}

/** Espera a que el media tenga thumbnails generados y devuelve sus metaIds embebidos. */
async function waitGeneratedThumbMetaIds(api, id) {
  let metas = new Set()
  await expect
    .poll(
      async () => {
        const thumbs = await getThumbs(api, id)
        metas = new Set(thumbs.map((t) => thumbMetaId(t.name)).filter(Boolean))
        return metas.size
      },
      { timeout: 120_000, intervals: [3000, 5000, 5000] }
    )
    .toBeGreaterThan(0)
  return metas
}

/** Lanza el replace por ingesta remota (reusa media_id). */
async function replaceMedia(api, id, fileUrl) {
  const params = new URLSearchParams({
    type: 'remote',
    media_id: id,
    fileUrl,
    file_name: `QA replace ${Date.now()}`,
    size: '1024',
    genre: 'movie',
  })
  const res = await api.get(`/api/media/upload?${params.toString()}`)
  expect(res.ok(), `replace respondió ${res.status()}`).toBeTruthy()
  const body = await res.json()
  expect(body.data?.jobId, 'replace debería devolver jobId').toBeTruthy()
}

/** Espera a que el transcoding del replace produzca metas nuevas en estado OK. */
async function waitForReplaceTranscoded(api, id, oldMetaIds) {
  await expect
    .poll(
      async () => {
        const media = await getMedia(api, id)
        const metas = media.meta || []
        const newOk = metas.filter(
          (m) => !oldMetaIds.has(String(m._id || m)) && m.status === 'OK'
        )
        return newOk.length
      },
      { timeout: 240_000, intervals: [5000, 5000, 10_000] }
    )
    .toBeGreaterThan(0)
}

test.describe('Thumbnails — replace actualiza imágenes derivadas @regression @thumbnails', () => {
  test('replace regenera los thumbnails: ninguno referencia metas del video anterior @THM-TC-5', async ({
    transcodedMedia,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(420_000)

    const before = await getMedia(api, transcodedMedia)
    const oldMetaIds = metaIdSet(before)
    await waitGeneratedThumbMetaIds(api, transcodedMedia)

    await replaceMedia(api, transcodedMedia, REPLACEMENT_VIDEO)
    await waitForReplaceTranscoded(api, transcodedMedia, oldMetaIds)

    // Los thumbnails generados deben referenciar SOLO metas nuevas.
    await expect
      .poll(
        async () => {
          const thumbs = await getThumbs(api, transcodedMedia)
          const metas = thumbs.map((t) => thumbMetaId(t.name)).filter(Boolean)
          const stillOld = metas.filter((m) => oldMetaIds.has(m))
          // listo cuando hay thumbs y ninguno referencia metas viejas
          return metas.length > 0 && stillOld.length === 0
        },
        { timeout: 120_000, intervals: [3000, 5000, 5000] }
      )
      .toBe(true)
  })

  test('replace regenera el sprite/VTT de timeline @THM-TC-6', async ({
    transcodedMedia,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(420_000)
    test.fail(true, 'Bug #16: replace no regenera el sprite/VTT (vtt_created no se resetea).')

    // Derivar la URL del sprite y esperar a que el sprite ORIGINAL exista (se
    // genera ~20s después de los thumbs); recién entonces capturar su huella.
    const thumbUrl = await waitForThumbsWithUrl(api, transcodedMedia)
    const urls = spriteUrlsFromThumb(thumbUrl, transcodedMedia)
    expect(urls, 'no se pudo derivar la URL del sprite').toBeTruthy()
    const beforeHash = await waitForSpriteHash(api, urls.jpg)
    expect(beforeHash, 'el sprite original debería existir antes del replace').toBeTruthy()

    const before = await getMedia(api, transcodedMedia)
    const oldMetaIds = metaIdSet(before)

    await replaceMedia(api, transcodedMedia, REPLACEMENT_VIDEO)
    await waitForReplaceTranscoded(api, transcodedMedia, oldMetaIds)
    // Esperar a que los thumbnails se regeneren = el pipeline post-transcoding
    // (que también regeneraría el sprite) ya corrió para el nuevo video.
    await expect
      .poll(async () => {
        const t = await getThumbs(api, transcodedMedia)
        const metas = t.map((x) => thumbMetaId(x.name)).filter(Boolean)
        return metas.length > 0 && metas.every((m) => !oldMetaIds.has(m))
      }, { timeout: 120_000, intervals: [3000, 5000, 5000] })
      .toBe(true)

    // Dar al sprite margen suficiente para regenerarse (aparece ~30s tras el
    // transcoding): poll hasta que su huella CAMBIE. Si se regenera (fix
    // aplicado) el poll lo detecta y el test pasa; si no, queda igual = bug #16.
    const afterHash = await pollSpriteChange(api, urls.jpg, beforeHash, 90_000)
    expect(afterHash, 'el sprite debería haberse regenerado (distinto al anterior)').not.toBe(
      beforeHash
    )
  })
})

/** Espera a que exista un thumb con URL (para derivar el sprite). */
async function waitForThumbsWithUrl(api, id) {
  let url = null
  await expect
    .poll(
      async () => {
        const thumbs = await getThumbs(api, id)
        url = thumbs.find((t) => /_\d+s\.jpg$/.test(t.name || '') && t.url)?.url || null
        return !!url
      },
      { timeout: 120_000, intervals: [3000, 5000, 5000] }
    )
    .toBe(true)
  return url
}

/** SHA-1 del sprite JPEG, o null si aún no existe / falla la petición. */
async function spriteHash(api, jpgUrl) {
  try {
    const res = await api.get(`${jpgUrl}?cb=${Date.now()}`, { timeout: 8000 })
    if (!res.ok()) return null
    return crypto.createHash('sha1').update(await res.body()).digest('hex')
  } catch {
    return null
  }
}

/** Poll hasta que el sprite exista y devuelve su huella. */
async function waitForSpriteHash(api, jpgUrl) {
  let hash = null
  await expect
    .poll(
      async () => {
        hash = await spriteHash(api, jpgUrl)
        return !!hash
      },
      { timeout: 120_000, intervals: [3000, 5000, 5000] }
    )
    .toBe(true)
  return hash
}

/** Poll hasta que la huella del sprite cambie respecto a `baseline`, o timeout. */
async function pollSpriteChange(api, jpgUrl, baseline, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = baseline
  while (Date.now() < deadline) {
    const h = await spriteHash(api, jpgUrl)
    if (h && h !== baseline) return h
    if (h) last = h
    await new Promise((r) => setTimeout(r, 5000))
  }
  return last
}
