// @ts-check
const { test, expect } = require('../../../src/fixtures')
const { jpegSize, parseVttTiles, countCues, spriteUrlsFromThumb } = require('../../../src/utils/sprite')

/**
 * Regresión — Thumbnails: sprite de timeline ↔ VTT (@regression @thumbnails).
 * Comportamiento validado en vivo contra dev.platform.mediastre.am.
 *
 * Garantiza que el seek-preview (scrubbing) sea correcto: las dimensiones del
 * sprite JPEG deben coincidir con la grilla declarada en el VTT, todos los tiles
 * el mismo tamaño y sin overflow.
 *
 * Read-only (patrón MED-TC-012): valida un invariante ESTRUCTURAL sobre un media
 * que ya tiene sprite (la generación fresca del sprite es un job VMS lento; aquí
 * interesa la consistencia, no el timing). El sprite/VTT son artefactos del CDN
 * (cross-origin) — se leen por HTTP con el APIRequestContext (URLs absolutas).
 */

/** Primer thumb generado con URL de un media. */
async function generatedThumbUrl(api, id) {
  const res = await api.get(`/api/media/${id}/thumbs`)
  if (!res.ok()) return null
  const thumbs = (await res.json()).data?.thumbnails || []
  return thumbs.find((t) => /_\d+s\.jpg$/.test(t.name || '') && t.url)?.url || null
}

/**
 * Encuentra en el listado un media cuyo sprite/VTT ya esté disponible en el CDN,
 * y devuelve sus cuerpos ya descargados.
 * @returns {Promise<{ id: string, jpg: Buffer, vtt: string } | null>}
 */
async function findMediaWithSprite(api) {
  const res = await api.get('/api/media?admin=true&all=true&limit=25&sort=-date_created&lite=true')
  expect(res.ok(), `listado falló ${res.status()}`).toBeTruthy()
  const list = (await res.json()).data || []
  for (const item of list) {
    const id = String(item._id)
    const thumbUrl = await generatedThumbUrl(api, id)
    if (!thumbUrl) continue
    const urls = spriteUrlsFromThumb(thumbUrl, id)
    if (!urls) continue
    const [rj, rv] = await Promise.all([api.get(urls.jpg), api.get(urls.vtt)])
    if (rj.ok() && rv.ok()) {
      return { id, jpg: await rj.body(), vtt: await rv.text() }
    }
  }
  return null
}

test.describe('Thumbnails — sprite/VTT de timeline @regression @thumbnails', () => {
  test('el sprite JPEG y el VTT son consistentes (grid==dims, tile uniforme, cues==tiles) @THM-TC-4', async ({
    api,
  }) => {
    test.setTimeout(120_000)

    const found = await findMediaWithSprite(api)
    expect(found, 'no se encontró ningún media con sprite/VTT disponible en el listado').toBeTruthy()

    const { width, height } = jpegSize(found.jpg)
    const tiles = parseVttTiles(found.vtt)
    expect(tiles.length, 'el VTT debería declarar tiles').toBeGreaterThan(0)

    // 1) Todos los tiles tienen el mismo tamaño (THM-AC-6).
    const widths = [...new Set(tiles.map((t) => t.w))]
    const heights = [...new Set(tiles.map((t) => t.h))]
    expect(widths, 'ancho de tile no uniforme').toHaveLength(1)
    expect(heights, 'alto de tile no uniforme').toHaveLength(1)

    // 2) La grilla implícita cubre exactamente el sprite, sin overflow (THM-AC-5/6).
    const gridRight = Math.max(...tiles.map((t) => t.x + t.w))
    const gridBottom = Math.max(...tiles.map((t) => t.y + t.h))
    expect(gridRight, 'el ancho de la grilla VTT no coincide con el JPEG').toBe(width)
    expect(gridBottom, 'el alto de la grilla VTT no coincide con el JPEG').toBe(height)

    // 3) nº de cues == nº de tiles == cols×rows (THM-AC-7).
    const cols = new Set(tiles.map((t) => t.x)).size
    const rows = new Set(tiles.map((t) => t.y)).size
    expect(countCues(found.vtt), 'cues != tiles').toBe(tiles.length)
    expect(cols * rows, 'tiles != cols×rows (grilla irregular)').toBe(tiles.length)
  })
})
