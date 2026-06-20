// @ts-check
const { test, expect } = require('../../src/fixtures')
const { env } = require('../../src/utils/env')

/**
 * Regresión — Detalle de Media: Ad Markers (@regression @media).
 * Comportamiento validado en vivo contra dev.platform.mediastre.am.
 *
 * Mezcla:
 *  - Read-only (firstMediaId, como MED-TC-012): validaciones que rechazan y no
 *    escriben en DB.
 *  - Escritura self-contained (fixture transcodedMedia): crea un media real con
 *    duración conocida y lo borra al terminar.
 *  - Pruebas vivas test.fail() por cada bug filado (#14, #15).
 */

/** @param {number} totalSeconds @returns {string} HH:MM:SS */
function toHHMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** @returns {Promise<any>} documento media (data) por API. */
async function fetchMedia(api, id) {
  const res = await api.get(`/api/media/${id}`)
  return (await res.json()).data
}

async function trackCount(api, id) {
  const media = await fetchMedia(api, id)
  return (media.tracks || []).length
}

test.describe('Media detail — Ad Markers @regression @media', () => {
  test('un tiempo con formato inválido es rechazado sin escritura @MED-TC-014', async ({
    mediaPage,
    mediaDetailPage,
    api,
  }) => {
    await mediaPage.goto()
    const id = await mediaPage.firstMediaId()
    expect(id, 'no se pudo derivar un media del listado').toBeTruthy()
    await mediaDetailPage.goto(String(id))

    const before = await trackCount(api, String(id))
    await mediaDetailPage.openCreateAdMarkerModal()
    await mediaDetailPage.submitAdMarkerTime('99:99')

    // Rechazo: el modal sigue abierto y no se creó ningún track.
    await expect(mediaDetailPage.markerTimeInput).toBeVisible()
    await expect
      .poll(async () => trackCount(api, String(id)), { timeout: 5_000 })
      .toBe(before)
  })

  test('un tiempo mayor a la duración es rechazado sin escritura @MED-TC-015', async ({
    mediaPage,
    mediaDetailPage,
    api,
  }) => {
    await mediaPage.goto()
    const id = await mediaPage.firstMediaId()
    expect(id, 'no se pudo derivar un media del listado').toBeTruthy()
    await mediaDetailPage.goto(String(id))

    const before = await trackCount(api, String(id))
    await mediaDetailPage.openCreateAdMarkerModal()
    // Excede cualquier duración. El toast "Time exceeds video duration (...)" es
    // transitorio; se valida el efecto determinista: rechazo (modal + sin escritura).
    await mediaDetailPage.submitAdMarkerTime('99:00:00')

    await expect(mediaDetailPage.markerTimeInput).toBeVisible()
    await expect
      .poll(async () => trackCount(api, String(id)), { timeout: 5_000 })
      .toBe(before)
  })

  test('crear un ad marker en un tiempo válido lo persiste @MED-TC-016', async ({
    transcodedMedia,
    mediaDetailPage,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(180_000)

    const media = await fetchMedia(api, transcodedMedia)
    const duration = Math.floor(media.duration || 0)
    test.skip(duration < 2, `media de prueba muy corto (${duration}s) para un midroll`)
    const mid = Math.max(1, Math.floor(duration / 2))

    await mediaDetailPage.goto(transcodedMedia)
    await mediaDetailPage.openCreateAdMarkerModal()
    await mediaDetailPage.submitAdMarkerTime(toHHMMSS(mid))

    await expect
      .poll(
        async () => {
          const m = await fetchMedia(api, transcodedMedia)
          return (m.tracks || []).some((t) => t.position === mid)
        },
        { timeout: 15_000, intervals: [1000, 2000, 3000] }
      )
      .toBe(true)
  })

  test('una posición de ad marker fuera de rango (> duración) debería rechazarse @MED-TC-017', async ({
    transcodedMedia,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(180_000)
    test.fail(
      true,
      'Bug #15: no hay validación server-side de posición; la API/quick-add aceptan fuera de rango.'
    )

    const media = await fetchMedia(api, transcodedMedia)
    const duration = Math.floor(media.duration || 0)
    const outOfRange = duration + 100

    // El modal cliente valida `> duración`, pero `new-ad-marker` (quick-add desde
    // el playhead) y la API directa NO: el backend (track/create.js) guarda la
    // posición sin validarla. Se prueba el contrato real por API.
    await api.post(`/api/media/${transcodedMedia}/track`, {
      form: { isAd: 'true', position: String(outOfRange), name: 'QA out-of-range' },
    })

    // Esperado (correcto): una posición fuera de rango NO debería persistir.
    await expect
      .poll(
        async () => {
          const m = await fetchMedia(api, transcodedMedia)
          return (m.tracks || []).some((t) => t.position === outOfRange)
        },
        { timeout: 10_000, intervals: [1000, 2000, 3000] }
      )
      .toBe(false)
  })

  test('un ad marker manual debería ser distinguible (no "Smart Ad Break") @MED-TC-018', async ({
    transcodedMedia,
    mediaDetailPage,
    api,
  }) => {
    test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')
    test.setTimeout(180_000)
    test.fail(true, 'Bug #14: todo marker manual se nombra "Smart Ad Break" (no editable).')

    const media = await fetchMedia(api, transcodedMedia)
    const duration = Math.floor(media.duration || 0)
    test.skip(duration < 2, 'media de prueba muy corto')
    const mid = Math.max(1, Math.floor(duration / 2))

    await mediaDetailPage.goto(transcodedMedia)
    await mediaDetailPage.openCreateAdMarkerModal()
    await mediaDetailPage.submitAdMarkerTime(toHHMMSS(mid))

    let name = null
    await expect
      .poll(
        async () => {
          const m = await fetchMedia(api, transcodedMedia)
          const track = (m.tracks || []).find((t) => t.position === mid)
          name = track?.name
          return !!track
        },
        { timeout: 15_000, intervals: [1000, 2000, 3000] }
      )
      .toBe(true)

    // Esperado (correcto): un marker manual NO debería llamarse "Smart Ad Break".
    expect(name).not.toBe('Smart Ad Break')
  })
})
