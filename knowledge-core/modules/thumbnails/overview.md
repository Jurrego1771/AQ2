# Thumbnails / Preview — Overview estructural (mapa del módulo)

> Módulo separado de **media** (decisión de producto): aunque vive en la misma página
> `/media/:id`, el dominio de imágenes (thumbnails de portada, sprite de timeline, preview clip)
> tiene reglas propias (replace, sprite↔VTT, dimensiones) que merecen su propio knowledge + tests.
> Conocimiento **estructural** (barato/estable) aquí; el **comportamiento** vive en
> `historias.yaml` (AC) y `riesgos.yaml`, poblado explorando.

Prefijo de IDs: **THM** · Vive en la página de detalle de media: `/media/:id` (vista `media.coffee`).
POM: se reutiliza `src/pages/media-detail.page.js` (el POM mapea la **página**; el módulo QA mapea
el **dominio**). Provisioning self-contained: fixture `transcodedMedia`.

## Tres tipos de imagen (no confundir)
| Tipo | Qué es | Dónde | Nombre/URL |
|------|--------|-------|-----------|
| **Thumbnails (portada)** | imágenes seleccionables; una es el default | área `thumbs`, API `/thumbs` | `thumb_<mediaId>_<metaId>_<Ns>.jpg` (generados) o `<...>.png` (user) |
| **Sprite de timeline** | mosaico para el seek-preview (scrubbing) | CDN `THUMBS_HOST` | `preview_<mediaId>.jpg` + `preview_<mediaId>.vtt` |
| **Preview clip** | mini-video de hover (autoplay/loop) | `EMBED_HOST` | `<mediaId>/preview.mp4` / `.webm` |

## Endpoints (auth por sesión)
- `GET  /api/media/:id/thumbs` — lista de thumbnails (1 entrada por timestamp × resolución).
- `POST /api/media/:id/thumb` (position+size) — genera thumb desde el video.
- `POST /api/media/:id/thumb/:thumbId` — **set as default** (mueve `is_default` al grupo).
- `DELETE /api/media/:id/thumb/:thumbId` — borra (bloquea borrar el último).
- `POST /api/media/:id/thumbnail/upload` — registra un thumb subido (tras subir a CDN).
- `POST /api/media/:id/thumb_crop` (x,y,w,h,file_name) — recorta (solo si w&h>0; crop opcional).
- `POST /api/media/:id/preview` (position 0–N, duration 1–120) — regenera el **clip** → `{ jobId }`.
- **Replace de media:** `GET /api/media/upload?type=remote&media_id=:id&fileUrl=&file_name=&size=`
  → reusa el mismo `media_id` (`upload.js` → `_metadata.replace_media_id`). Valida
  `ERROR_DIFFERENT_MEDIA_TYPE` (no cambiar video↔audio).

## Sprite de timeline ↔ VTT (contrato de dimensiones)
- El sprite es una **grilla fija 10×10 = 100 tiles** (independiente de la duración del video; lo que
  cambia con el contenido es el frame de cada tile, no las dimensiones).
- Cada cue del VTT apunta a `preview_<id>.jpg#xywh=x,y,w,h`. **Invariantes verificados (en vivo):**
  - Todos los tiles tienen el **mismo** `w×h` (ej. 216×122, aspect ≈ 16:9).
  - nº de cues == nº de tiles == cols×rows.
  - `max(x+w) × max(y+h)` (grid implícita) == **dimensiones reales del JPEG** (ej. 2160×1220).
  - Sin overflow (ningún tile excede el sprite) ni gaps.
- **Assert de dimensiones (THM-AC-5/6):** descargar el JPEG (leer W×H del header) y el VTT (parsear
  xywh); verificar tile uniforme + grid==sprite + cues==cols×rows.

## Replace de media — comportamiento (verificado en vivo)
- `media_id` es **estable** en replace (mismo documento); cambian los `metaId` (nuevo transcoding).
- **Thumbnails generados:** SE regeneran ✅ (`notify_status.js` purga los generados —
  `partitionedThumbs[1]`— y conserva solo los user-uploaded `[0]`; el nuevo transcoding crea nuevos).
  **Assert (THM-AC-8):** el `metaId` embebido en `thumb_<mediaId>_<metaId>_<Ns>.jpg` cambia; tras
  replace ningún thumb debe referenciar los metaIds del video anterior.
- **Sprite/VTT de timeline:** **NO se regeneran** ❌ → **bug [[AQ2#16]]** (THM-RISK-1). Causa:
  `notify_status.js` resetea `media.preview={}` (clip sí se regenera) pero **no** `media.vtt_created`,
  y `create_vtt` (fn.js) está gated por `!media.vtt_created`. Verificado: sprite/VTT byte-idénticos
  tras un replace que cambió duración (7→6) y regeneró metas+thumbnails. Fix: `media.vtt_created=false`
  en el bloque de replace.

## Thumbnails (portada) — comportamiento (verificado en vivo)
- **Modelo:** `/thumbs` devuelve 1 entrada por (timestamp × resolución). La UI **agrupa por
  timestamp** y renderiza un representativo por segundo (las demás resoluciones detrás de `copy-thumb`).
  `is_default` aplica al grupo. (1 thumb visible con 3 en API = agrupación intencional, no bug.)
- **Set default** (`select-thumb`, "Set as default"): `POST /thumb/:id`; mueve `is_default`. ✅
- **Add por upload** (modal `#upload-media`, `image/*` máx 2MB): `POST /thumbnail/upload` **registra
  el thumb antes del crop** (aparece en `/thumbs`, `size:"original"`). Jcrop arranca **sin selección**
  (x/y/w/h=0); `save-edited-thumbnail` solo hace `thumb_crop` si w&h>0 (crop opcional). ✅
- **Generar desde el video** (`new-thumbnail`): `POST /thumb`; depende de `player.currentTime`
  (no-op silencioso si =0, mismo patrón que ad markers/tracks).
- **Prevención de error:** `delete-thumb` bloquea borrar el último ("Cannot delete the last
  thumbnail"); `replace-preview` advierte "previous preview will be completely lost".

## Preview clip — comportamiento
- `new-preview` → `POST /preview` → `{ jobId }`; **500 ERROR_REQUESTING_PREVIEW_CREATION** si el
  media aún no tiene renditions listas (pipeline async post-transcoding). `replace-preview` → modal
  `#upload-preview` (file `video/*`).

## Testabilidad
- Thumbs/sprite/preview se generan en un paso **async posterior** al transcoding: el gate de
  transcoding del fixture NO los garantiza → esperar readiness con `expect.poll`.
- Sprite/VTT viven en CDN cross-origin → en specs, leerlos con `request.newContext()` (sin storage),
  comparar ETag/bytes para detectar (no) regeneración. Thumbs cargan async en UI (`/thumbs` + socket).
