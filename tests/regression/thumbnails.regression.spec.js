// @ts-check
const path = require('path')
const { test, expect } = require('../../src/fixtures')
const { env } = require('../../src/utils/env')

/**
 * Regresión — Módulo Thumbnails: portada / preview (@regression @thumbnails).
 * Comportamiento validado en vivo contra dev.platform.mediastre.am.
 *
 * Self-contained: el fixture `transcodedMedia` crea un media real (ingesta remota
 * + transcoding, que genera thumbnails automáticamente) y lo borra al terminar.
 *
 * Nota de modelo: `/api/media/:id/thumbs` devuelve una entrada por (timestamp ×
 * resolución). La UI agrupa por timestamp y muestra un thumb representativo. El
 * flag `is_default` aplica al grupo de timestamp.
 */

const THUMB_IMAGE = path.resolve(__dirname, '../../assets/qa-thumbnail-16x9.png')

/** @returns {Promise<any[]>} thumbnails crudos por API. */
async function fetchThumbs(api, id) {
  const res = await api.get(`/api/media/${id}/thumbs`)
  return (await res.json()).data?.thumbnails || []
}

/** Extrae el timestamp (segundos) del nombre del thumb generado, o null. */
function thumbSeconds(name) {
  const m = /_(-?\d+)s\.jpg$/.exec(name || '')
  return m ? Number(m[1]) : null
}

/** Espera a que exista un thumb generado en `seconds` y lo devuelve. */
async function waitForThumbAt(api, id, seconds) {
  let found = null
  await expect
    .poll(
      async () => {
        const thumbs = await fetchThumbs(api, id)
        found = thumbs.find((t) => thumbSeconds(t.name) === seconds)
        return !!found
      },
      { timeout: 60_000, intervals: [2000, 3000, 5000] }
    )
    .toBe(true)
  return found
}

/**
 * Espera a que el media tenga sus thumbnails auto-generados. El gate de
 * transcoding del fixture no garantiza que el pipeline de thumbs/preview ya
 * terminó; estos se generan en un paso async posterior.
 */
async function waitForMediaThumbnails(api, id) {
  await expect
    .poll(async () => (await fetchThumbs(api, id)).length, {
      timeout: 120_000,
      intervals: [2000, 3000, 5000],
    })
    .toBeGreaterThan(0)
}

test.describe('Thumbnails @regression @thumbnails', () => {
  test('setear un thumbnail como default cambia is_default (verificado por API) @THM-TC-1', async ({
    transcodedMedia,
    mediaDetailPage,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(240_000)

    // El media nace con thumbs en un único timestamp. Para tener 2 grupos y poder
    // cambiar el default, se genera uno adicional en otra posición por el mismo
    // endpoint que usa `new_thumbnail`. Antes, esperar a que el pipeline de
    // thumbnails (async, posterior al transcoding) haya generado los iniciales.
    await waitForMediaThumbnails(api, transcodedMedia)
    const media = await fetchThumbs(api, transcodedMedia)
    const baseSeconds = thumbSeconds(media[0].name) ?? 0
    const otherSeconds = baseSeconds === 1 ? 2 : 1

    await api.post(`/api/media/${transcodedMedia}/thumb`, {
      form: { position: String(otherSeconds), size: '360p', width: '640', height: '360' },
    })
    await waitForThumbAt(api, transcodedMedia, otherSeconds)

    // La UI renderiza un thumb representativo por timestamp (esos son los ids con
    // botón "Set as default" clickeable). Se elige como objetivo uno renderizado
    // que AHORA no sea default (cuál nace default es una carrera del pipeline).
    await mediaDetailPage.goto(transcodedMedia)
    const renderedIds = await mediaDetailPage.thumbIds()
    expect(renderedIds.length, 'deberían renderizarse ≥2 thumbnails').toBeGreaterThanOrEqual(2)

    const thumbs = await fetchThumbs(api, transcodedMedia)
    const isDefault = (id) => thumbs.find((t) => String(t._id) === String(id))?.is_default === true
    const targetId = renderedIds.find((id) => !isDefault(id))
    expect(targetId, 'debería haber un thumb renderizado no-default').toBeTruthy()

    await mediaDetailPage.setThumbnailAsDefault(targetId)

    // El default debe moverse al thumb recién seleccionado.
    await expect
      .poll(
        async () => {
          const after = await fetchThumbs(api, transcodedMedia)
          return after.find((x) => String(x._id) === String(targetId))?.is_default === true
        },
        { timeout: 15_000, intervals: [1000, 2000, 3000] }
      )
      .toBe(true)
  })

  test('subir una imagen agrega un thumbnail que persiste @THM-TC-2', async ({
    transcodedMedia,
    mediaDetailPage,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(240_000)

    const before = await fetchThumbs(api, transcodedMedia)
    const beforeUserCount = before.filter((t) => thumbSeconds(t.name) === null).length

    await mediaDetailPage.goto(transcodedMedia)
    await mediaDetailPage.uploadThumbnail(THUMB_IMAGE)

    // El upload registra el thumb (POST /thumbnail/upload) sin requerir crop: debe
    // aparecer una entrada "de usuario" (nombre sin patrón _Ns) nueva.
    await expect
      .poll(
        async () => {
          const thumbs = await fetchThumbs(api, transcodedMedia)
          return thumbs.filter((t) => thumbSeconds(t.name) === null).length
        },
        { timeout: 30_000, intervals: [2000, 3000, 5000] }
      )
      .toBeGreaterThan(beforeUserCount)
  })

  test('regenerar el preview encola un job y responde OK @THM-TC-3', async ({
    transcodedMedia,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(240_000)

    // `new-preview` regenera el preview desde una posición (POST /preview). El
    // server responde 500 ERROR_REQUESTING_PREVIEW_CREATION si el media aún no
    // tiene renditions listas (pipeline async post-transcoding); cuando está
    // listo devuelve OK + jobId. Se reintenta hasta readiness (sin falso verde).
    let lastBody = null
    await expect
      .poll(
        async () => {
          const res = await api.post(`/api/media/${transcodedMedia}/preview`, {
            form: { position: '1' },
          })
          lastBody = res.ok() ? await res.json() : { status: res.status() }
          return lastBody?.data?.jobId ? 'OK' : 'PENDING'
        },
        { timeout: 180_000, intervals: [5000, 5000, 10_000] }
      )
      .toBe('OK')
    expect(lastBody.status).toBe('OK')
    expect(lastBody.data?.jobId, 'debería devolver un jobId de regeneración').toBeTruthy()
  })
})
