// @ts-check

/**
 * Utilidades del sprite de timeline (seek-preview) y su WebVTT.
 *
 * El sprite es un mosaico `preview_<mediaId>.jpg` y el VTT `preview_<mediaId>.vtt`
 * mapea, por rango de tiempo, un tile `#xywh=x,y,w,h` dentro del JPEG. Estas
 * funciones derivan las URLs del CDN y validan la consistencia sprite↔VTT.
 */

/**
 * Lee el ancho/alto de un JPEG desde su buffer (marcadores SOF0–SOF15).
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number }}
 */
function jpegSize(buffer) {
  let i = 2
  while (i < buffer.length) {
    if (buffer[i] !== 0xff) {
      i++
      continue
    }
    const marker = buffer[i + 1]
    // SOF markers carry the frame size; skip non-frame and stand-alone markers.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) }
    }
    i += 2 + buffer.readUInt16BE(i + 2)
  }
  throw new Error('no se encontró el marcador SOF del JPEG')
}

/**
 * Parsea los tiles `#xywh=` de un WebVTT de sprite.
 * @param {string} vtt
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
function parseVttTiles(vtt) {
  return [...vtt.matchAll(/#xywh=(\d+),(\d+),(\d+),(\d+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
  }))
}

/**
 * Cuenta las cues (líneas de tiempo) de un WebVTT.
 * @param {string} vtt
 * @returns {number}
 */
function countCues(vtt) {
  return (vtt.match(/-->/g) || []).length
}

/**
 * Construye las URLs del sprite/VTT a partir de la URL de un thumbnail generado
 * (que comparte host + accountId) y el mediaId.
 * @param {string} thumbUrl ej. https://devthumbs.cdn.mdstrm.com/thumbs/<acc>/thumb_<media>_<meta>_<n>s.jpg
 * @param {string} mediaId
 * @returns {{ jpg: string, vtt: string, host: string, accountId: string } | null}
 */
function spriteUrlsFromThumb(thumbUrl, mediaId) {
  const m = /^(https?:\/\/[^/]+)\/thumbs\/([0-9a-f]{24})\//i.exec(thumbUrl || '')
  if (!m) return null
  const [, host, accountId] = m
  const base = `${host}/thumbs/${accountId}/${mediaId}/preview_${mediaId}`
  return { jpg: `${base}.jpg`, vtt: `${base}.vtt`, host, accountId }
}

module.exports = { jpegSize, parseVttTiles, countCues, spriteUrlsFromThumb }
