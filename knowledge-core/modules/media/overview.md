# Media — Overview estructural (mapa del módulo)

> Conocimiento **estructural/factual** (dónde está, endpoints, formatos): barato y estable.
> El conocimiento de **comportamiento** (cómo se usa bien, qué es un error) vive en
> `historias.yaml` (AC) y `riesgos.yaml`, y se llena explorando — no aquí.
> Objetivo: que una tarea futura sobre media lea esto y NO re-explore el repo entero.

Prefijo de IDs: **MED** · Rutas UI: `/media` (listado), `/media/:id` (detalle/edición).

## Dónde vive en sm2 (SUT)
| Capa | Listado | Detalle/edición |
|------|---------|-----------------|
| Vista (CoffeeScript) | `views/medias.coffee` | `views/media.coffee` |
| Cliente (CoffeeScript) | `src/client/medias.coffee` | `src/client/media.coffee` |
| Rutas API server | `src/server/routes/api/media/**` | idem |

## Endpoints (observados en vivo, auth por sesión)
- `GET  /api/media?admin=true&all=true&limit=&skip=&sort=&title=&titleRules=contains` — listado/búsqueda.
- `GET  /api/media/:id` — detalle (full; incluye `meta[]` con status de renditions).
- `POST /api/media/:id` (form-urlencoded) — **guardar** (título, descripción, `categories[]`, etc.).
- `DELETE /api/media/:id` — borrar.
- `GET  /api/media/upload?type=remote&fileUrl=&file_name=&genre=&size=` — **ingesta remota** → `{ jobId }`
  (el media creado lleva el jobId como prefijo del título). Sin upload chunked.
- Sub-recursos del detalle: `/image` `/subtitle` `/tracks` `/thumbs` `/meta` `/chapters`
  `/highlights` `/quizzes` `/metadata` (este responde **404** en cada carga, ver #9).
- `GET /api/encoder/job_list` — cola de encoder (polling cada 5s, ver #7).

## Formatos / datos clave
- **Subtítulos aceptados: `.vtt`, `.ass`, `.srt`** (`views/media.coffee:1317`,
  `src/client/media.coffee:2880`; backend convierte srt→vtt vía `@mediastream/srt-to-vtt`).
- **Upload de media** acepta `video/*,audio/*,.3gp,.mkv` (`views/media.coffee:1641`); requiere
  **genre** seleccionado para habilitar el input.
- **Regla de cuenta:** `force_category_fill` activo → guardar exige categoría (si falta, el save
  se bloquea client-side antes del POST).

## Clústeres funcionales del detalle (/media/:id) — 233 marcas sm:, 11 áreas
| # | Clúster | Estado QA | Notas |
|---|---------|-----------|-------|
| 1 | Basic Information (título/descripción/categoría/fechas/permalink) | ✅ cubierto (US-003) | campos por `data-name`, no `sm:` (#13) |
| 2 | Metadata & Embed (copiar embed/ID/URLs HLS-DASH) | ⬜ pendiente | |
| 3 | Thumbnails / Preview | ⬜ pendiente | upload imagen |
| 4 | Ad Markers (preroll/midroll) | ⬜ pendiente | dinero/ads |
| 5 | Audio Tracks / Subtitles | ⬜ pendiente | subtítulos vtt/ass/srt |
| 6 | AI Studio (persons/keywords/labels/sentiments/emotions/OCR/captions) | ⬜ pendiente | async/IA, caro |
| 7 | Chapters / Highlights / Transcription | ⬜ pendiente | async/IA |
| 8 | Renditions (lista de calidades) | ⬜ pendiente | lectura |
| 9 | Quiz Manager | ⬜ pendiente | |
| 10 | Custom Attributes | ⬜ pendiente | |
| 11 | Share / Replace / Delete | ⬜ pendiente | acciones destructivas |

## Listado (/media) — áreas
Búsqueda (whole-word, #10), filtros (Published/Video/Audio/No Category), per-page (12/24/48/96),
paginación (skip en URL), 3 layouts (grid/list/minimal coexisten → usar `:visible`, #8).
Cubierto: búsqueda (US-001), filtros+paginación (US-002).

## Notas de testabilidad / comportamiento (verificado)
- La página de detalle hidrata el form con un GET async tras mostrar el título; editar antes de que
  hidrate hace que el cambio se pierda → esperar a que el título tenga valor antes de editar.
- La autogeneración de metadata IA al subir puede reescribir título/descripción async (configurable;
  se desactivó para los tests de edición).
- Verificar persistencia por **API**, no releyendo el field en UI (arranca vacío tras recargar).
