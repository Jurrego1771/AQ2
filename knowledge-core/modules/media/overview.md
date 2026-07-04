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
| 1b | Status (Published/Not Published, toggle) | ✅ cubierto (US-016) | consistente con listado y API; toggle sin `sm:` (#35) |
| 1c | Show/Seasons/Episodes (asignación de show) | ✅ cubierto (US-017) | picker sin `sm:` (`data-name="shows"`) |
| 2 | Metadata & Embed (copiar embed/ID/URLs HLS-DASH) | ⬜ pendiente | |
| 3 | Thumbnails / Preview | ↗ módulo aparte | ver módulo **thumbnails** (PFX THM) |
| 4 | Ad Markers (preroll/midroll) | ✅ cubierto (US-005) | manual+modal; bugs #14 #15 |
| 5 | Audio Tracks / Subtitles | ✅ cubierto (US-004) | subtítulos vtt/ass/srt; upload+IA |
| 6 | AI Studio (persons/keywords/labels/sentiments/emotions/OCR/captions) | ⬜ pendiente | async/IA, caro |
| 7 | Chapters / Highlights / Transcription | ⬜ pendiente | async/IA |
| 8 | Renditions (lista de calidades) | ⬜ pendiente | lectura |
| 9 | Quiz Manager | ↗ módulo aparte | ver módulo **quiz-manager** (PFX QUIZ) — explorado en vivo, sin tests automatizados aún |
| 10 | Custom Attributes | ⬜ pendiente (exploración UI) / ⚠️ riesgo identificado por código | ver `cross-cutting/custom-attributes/` — MED-RISK-011 |
| 11 | Share / Replace / Delete | ⬜ pendiente | acciones destructivas |

## Listado (/media) — áreas
Búsqueda (whole-word, #10), filtros (Published/Video/Audio/No Category), per-page (12/24/48/96),
paginación (skip en URL), 3 layouts (grid/list/minimal coexisten → usar `:visible`, #8).
Cubierto: búsqueda (US-001), filtros+paginación (US-002).

## Status / Published (cluster 1b) — comportamiento (verificado en vivo)
- Se reportó un caso de un media visto como **Published** (ícono verde) en la grilla del listado
  pero **despublicado** al abrir su detalle. Verificado en vivo (2026-07-03, dev): publicando y
  despublicando un media real por el toggle del detalle, las 3 vistas del listado (grid/list/
  minimal) y el detalle reabierto reflejan siempre `is_published` de una carga fresca por API —
  **no se reprodujo la desincronización**. Cubierto por MED-TC-021 (US-016).
- **Gap de testabilidad** (no bug): ningún indicador de estado (ícono/badge del listado, toggle
  del detalle) tiene marca `sm:` → [[AQ2#35]]. Los Page Objects usan una excepción documentada
  (mismo patrón que `data-name`, #13): leer texto del card por su marca real (`media-container-`)
  y localizar el toggle por `input[data-on="Published"]` (hay varios `.toggle` más en la página:
  ITG, Ads, Access Restrictions).
- **Hallazgo aparte** (sin issue filado aún): con la cuenta en `force_category_fill`, un media
  **sin categoría** bloquea el guardado del toggle Published en el cliente **sin ningún error
  visible** — el toggle queda visualmente en el nuevo estado pero nunca se persiste. Distinto del
  bug reportado (no es desincronización entre vistas), pero produce el mismo síntoma percibido.

## Show/Seasons/Episodes (cluster 1c) — comportamiento (verificado en vivo)
- **Reporte de cliente** (no hallado por QA): al asignar un Show desde el detalle de un media,
  un mismo show (ej. "Capital, la Bolsa y la Vida") aparecía listado 3 veces, aunque el módulo
  Show solo tiene 1 registro con ese nombre.
- **Causa raíz**: el picker de Show en Media pedía `GET /api/show/list?all=true`. El server
  (`src/server/routes/api/show/list.js`) interpreta `all=true` como "sin filtrar por status"
  (sin ese parámetro, filtra `status: 'OK'`). Con shows borrados (`status: DELETE`) compartiendo
  título entre sí o con uno activo, el dropdown los mostraba todos como entradas separadas.
  Verificado en dev (2026-07-03): 481 shows `OK` vs. **5896 shows `DELETE`** vía `all=true`;
  títulos como "Prueba Show api" (×5) y "Updated Show Title QA Test" (×4) existen **solo** como
  registros borrados — antes del fix habrían aparecido repetidos en el picker.
- **Fix**: [[mediastream/sm2#8442]] (issue) / [[mediastream/sm2#8443]] (PR, branch
  `fix/issue-8442` → `staging`, **sin mergear** en GitHub al momento de verificar) quita
  `?all=true` del picker cuando `@type is 'media'`. **Verificado en vivo (2026-07-03): el fix
  YA está desplegado en dev** — el request real no lleva `all=true` y el `<select>` no incluye
  ninguno de los shows borrados conocidos (0/482 opciones, vs. 6377 si se pidiera con `all=true`).
- El mismo PR agrega una guarda server-side (`media/update.js`): si al guardar se limpia
  `show_info.showId` y el show previamente asignado está `DELETE`, restaura el link anterior en
  vez de dejarlo en null — evita desvincular medias en silencio ahora que los shows borrados no
  aparecen en el picker. **No cubierto** por los tests de este módulo (fuera del alcance del
  reporte original); GAP conocido, sin issue filado.
- Cubierto por MED-TC-022 (contrato de `/api/show/list`) y MED-TC-023 (selector real del
  detalle, deriva del entorno los títulos exclusivos de shows borrados).

## Ad Markers (cluster 4) — comportamiento (verificado en vivo)
- Dos vías de creación: **`new-ad-marker`** crea YA un break en `player.currentTime` (POST
  `/api/media/:id/track` con `isAd:true`), sin modal ni confirmación; **no-op silencioso si
  `currentTime === 0`** (código: `if Number(position) > 0`, sin else). **`create-ad-marker`** abre
  el modal `#create-marker-modal` para entrada manual (`marker-time` HH:MM:SS → `create-marker-btn`).
- Validación de tiempo (modal y `save-track`): regex `^([0-9]{1,2}):([0-5][0-9]):([0-5][0-9])$` y
  `seconds > duration` → "Time exceeds video duration (HH:MM:SS)". Rechazos no escriben en DB y
  mantienen el modal abierto. ✅ correcto. **Borde aceptado: `== duration` y `== 0`** (bug #15).
- Todo marker manual lleva `name` fijo **"Smart Ad Break"** (igual que los de IA) y el campo de
  nombre de la fila está `disabled` → no renombrable / no distinguible del smart real (bug #14).
- Ad markers y tracks **comparten template de fila** (`trackOffset`/`trackName`/`save-track`/
  `delete-track`); el tipo se distingue por `data-track-type="ad"`.
- Los markers cargan **async** tras el render inicial (socket `/media/:id/load-ad-tracks`): el estado
  vacío "No ad markers" aparece primero y luego se reemplaza → esperar con `expect.poll`.
- `regenerate-smart-ad-markers` solo se renderiza con la cuenta configurada
  (`media_smart_ad_markers`) y exige `duration >= minimum_duration_minutes*60`; si hay markers pide
  `confirm` (borra los previos). No presente en el media de prueba de 46s.

## Tracks / Subtitles (cluster 5) — comportamiento (verificado en vivo)
- **Tracks** (`new-track`, "Add track"): tracks de tiempo genéricos ("Track N") en
  `player.currentTime` (mismo no-op si =0). `[sm="tracks"]` (ul), vacío "No tracks have been created".
- **Subtítulos — upload** (`#upload-subtitle`): file input `accept=".vtt,.ass,.srt"` (srt→vtt en
  backend). `save-subtitle` **disabled** hasta tener `subtitle-language` + `subtitle-name` + archivo.
  ✅ gate de validación correcto. POST `/api/media/:id/subtitle`.
- **Subtítulos — IA** (`#generate-subtitle`, "Auto Generate"): `generate-sub` disabled hasta
  `sub-name` + `sub-main-language`; POST `/api/media/:id/subtitle` con `speech_to_text:true` →
  "Generating speech text, this may take a few minutes". Errores async vía socket `error-subtitle`.
- Los triggers "Upload Subtitles" / "Auto Generate" viven en una **sección colapsable** (ocultos
  hasta expandir) → al automatizar, abrir la sección antes de interactuar.

## Notas de testabilidad / comportamiento (verificado)
- La página de detalle hidrata el form con un GET async tras mostrar el título; editar antes de que
  hidrate hace que el cambio se pierda → esperar a que el título tenga valor antes de editar.
- La autogeneración de metadata IA al subir puede reescribir título/descripción async (configurable;
  se desactivó para los tests de edición).
- Verificar persistencia por **API**, no releyendo el field en UI (arranca vacío tras recargar).
