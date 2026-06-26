# Live Editor — Overview estructural (mapa del módulo)

> Editor de clips sobre el **DVR** de un evento en vivo (video o audio): retrocede
> en el buffer, selecciona un rango, corta clips y los genera como media. Conocimiento
> **estructural** (barato/estable) aquí; el **comportamiento** vive en `historias.yaml`
> (AC) y `riesgos.yaml`. La verdad es el entorno corriendo, no los `.coffee`.

Prefijo de IDs: **LEDT** · Épica: `live-editor-management`. Entorno verificado: dev, v7.0.67.

## Rutas y vistas
- Listado/picker: `/live-editor` (vista `live_editor.coffee`). Si hay **un solo** evento
  con DVR retention, **redirige** a `/live-editor/:id`; si hay varios, muestra picker.
- Editor: `/live-editor/:event_id` (vista `live_editor_detail.coffee`, ~681 líneas; client
  `src/client/live_editor/detail.coffee`, ~134k). Cliente API: `src/api/live-editor.client.js`
  (`EditorClient` + `LiveEditorClient`).

## Acceso (precondiciones)
- Cuenta con **`cdn_zone`** (si falta -> create responde 500 `NO_CDN_ZONE_AVAILABLE`).
- Evento con **DVR retention** (`cdn.dvr_retention_time`); sin retention, `/live-editor`
  no redirige al editor.
- Módulo `live_editor` habilitado; **write** para cortar clips (`canCutClips`). Sin acceso
  al tipo (live/live_audio) -> **403** en el detail.
- Lives de prueba en dev (NO modificar): video `6a15a4e5a23b8b92586beb63` ("Live Dai QA"),
  audio `6a15a149cedcd6929d34cc78` ("Radio QA"). Ambos retention 1h.

## Contrato API (verificado en vivo)

> **Crear media desde clips usa `POST /api/dvr/:id`, NO `/api/editor`.** El client del
> editor (`detail.coffee:2326`) hace `$.post("/api/dvr/#{event_id}", { url:[clip urls] })`
> al pulsar "New Media". `/api/editor` es un endpoint hermano (edición de media existente).

Creación de media — **`POST /api/dvr/:live_stream_id`**:
- Body `{ url: [clipUrl], transcriptionJobIds?, template? }`. Cada clipUrl lleva
  `?start=...&end=...&dvr=...`. OK -> `{ status:'OK', data:{ mediaId, vms_job_request_id } }`.
- Sin cdn_zone -> **500 `NO_CDN_ZONE_AVAILABLE`**; evento inexistente -> **404 `LIVESTREAM_NOT_FOUND`**.
- **BUG AQ2#32 (LEDT-RISK-5)**: `cutDurations` tiene la guarda invertida + `return` dentro de
  `forEach` → la validación de duración está **anulada**. Un clip >`MAX_DURATION_HOURS` (10h) o
  una URL sin `start`/`end` devuelven **200 y crean media** (debería ser 400). Prueba viva LEDT-TC-10.

Familia **`/api/editor`** (edición de media; robusto):
- `POST /api/editor` — crea job de edición. Body `{ type, id, url[], media_edit_type, template }`.
  Solo procesa `type:'media'`; `type:'live'` u objeto inexistente -> **400 `INVALID_VIDEO_OBJECT`**.
  Sin cdn_zone -> **500 `NO_CDN_ZONE_AVAILABLE`**. OK -> `{ status:'OK', data:{ mediaId, jobId } }`.
- `GET /api/editor/media/:media_id/job-status` — id no-ObjectId -> **404 `INVALID_MEDIA`**
  (rama else, ignora el CastError; **no** 500). ObjectId válido sin jobs -> **200 `{data:[]}`**.
- `POST /api/editor/create-preview` — requiere `id`,`type`,`meta_id`; si falta -> **400 `BAD_REQUEST`**.

Familia **`/api/live-editor`** (datos del editor):
- `GET /api/live-editor/:id` — carga del editor; id inválido -> **404 `NOT_FOUND`**.
- `GET /api/live-editor/:id/media/:media_id[/thumbs]`, `POST .../moment`,
  `POST .../share/:service/media/:media_id`, `GET/POST .../transcription` (no explorados a fondo).

## Marcas `sm` cosechadas en vivo (contrato de selectores, 89 únicas)
- **Timeline/DVR**: `dvr-editor-live`, `timeline`, `tl-date-from`, `go-click` (Go), `go-live`,
  `dvr-player-controls`, `dvr-play-pause-button`, `dvr-volume`, `move-backward`, `move-forward`,
  `zoomIn`, `zoomOut`, `time-selected`.
- **Selección/corte**: `tl-cut-left`, `tl-cut-right`, `cut-in`, `cut-out`, `cut-length`,
  `selection-play-first-five-seconds`, `selection-play-last-five-seconds`, `dvr-cut-clip`.
- **Lista de clips**: `dvr-clip-list`, `box-media-clips`, `dvr-clips-message`, `dvr-preview-clip`,
  `dvr-continue-edit`, `mini-clips-durations`, `dvr-media-duration` (+ `sm-play-clip`/`sm-delete-clip`
  por clip, aún no visibles sin clips cortados).
- **Crear media**: `dvr-create-media`, `dvr-create-media-with-template` (**disabled** hasta ≥1 clip),
  `dvr-media-title/description/tags/categories/thumb/url`, `dvr-select-thumbnail`, `dvr-thumbnails`,
  `dvr-media-save`, `dvr-media-back-without-save`, `use-moai` (MoAI mejora metadata).
- **Metadata/share/descargas/jobs**: `settingMetadata`, `update-metadata-settings`,
  `metadata-background-color-`, `social-share`, `share-action`, `dvr-share-accounts`, `copy-to-clip`,
  `download-buttons`, `metas-download`, `job-id`, `transcoder-progress`, `media-upload-progress`,
  `metadata-progress`, `progress`, `dvr-notifications[-icon|-text]`.

## Flujos (inventario F1)
1. Acceso/carga editor + picker — **cubierto por API** (LEDT-TC-6, contrato).
2. Navegación DVR/timeline — **explorado en vivo** (date-picker + Go, zoom, move). UX/a11y
   cubierto (LEDT-TC-7/8/9); navegación sin defectos nuevos.
3. Selección + corte de clip — **cubierto** (LEDT-TC-11/12, ruta real i/o/c).
4. Lista de clips (multi-clip + delete) — **cubierto** (LEDT-TC-11/13: suma de duración).
5. Crear media desde clips — **explorado en vivo**: "New Media" hace `POST /api/dvr/:id` y
   crea media **de inmediato**; el form de metadata es para editar mientras transcodifica.
   Contrato de borde cubierto (LEDT-TC-1/2/5/10). Hallazgo #34 (ver abajo).
6. Progreso/job-status del editor — la UI lo deriva de `GET /api/live-editor/:id/media/:media_id`
   (+ `/thumbs`), **no** de `/api/editor/.../job-status`. Explorado.
7. Metadata settings / social share / descargas — no explorados a fondo (GAP).

> **Paridad video/audio (verificada en vivo 2026-06-26):** el editor de audio (`Radio QA`)
> se comporta igual que el de video. Multi-clip, creación y contrato idénticos; #29/#30/#34
> reproducen en ambos → son **globales** del módulo, no dependientes del tipo de señal.
> Evidencia: `reports/live-editor/audio-2026-06-26/`.

## Testabilidad
- **Cobertura actual:** contrato API (LEDT-TC-1..6, verdes) + prueba viva del bug #32
  (LEDT-TC-10, rojo-esperado) + UX/a11y de la toolbar (LEDT-TC-7/8 vivos, LEDT-TC-9 verde) +
  flujo de corte UI (LEDT-TC-11/12 verdes) y multi-clip/suma (LEDT-TC-13 verde). Los specs
  UI DVR-dependientes hacen `skip` si el buffer no está listo (no fallan en falso).
- Endpoints autorizados por **cookie de sesión** (storageState), sin token aparte.
- Probes de contrato no-destructivos (ids inválidos / body incompleto fallan antes de crear nada).
- POM: `src/pages/live-editor.page.js` (solo `sm()`). Specs: `tests/api/live-editor.api.spec.js`,
  `tests/regression/live-editor.regression.spec.js`. Cliente API: `src/api/live-editor.client.js`.

## Hallazgos filados (GitHub)
- **AQ2#32** (bug, medium): `POST /api/dvr` no valida duración ni inicio/fin del clip —
  `cutDurations` con guarda invertida + `return` en `forEach` (`create.js:20-49`). Crea media
  con payloads inválidos (>MAX_DURATION_HOURS, sin start/end). Prueba viva LEDT-TC-10. Riesgo
  LEDT-RISK-5. **MUST**.
- **AQ2#29** (a11y, low): `zoomIn`/`zoomOut` `<div>` sin nombre accesible ni foco/tabindex
  (WCAG 4.1.2/2.1.1). Prueba viva LEDT-TC-7. Riesgo LEDT-RISK-2.
- **AQ2#30** (ux, low): typo `title="Move selection rigth"` en `move-forward`. Prueba viva
  LEDT-TC-8. Riesgo LEDT-RISK-3.
- **AQ2#31** (ux, low): pluralización `"Retention: 1 hours"` por redondeo en el borde de 1h
  (`detail.coffee:198-199`). Riesgo LEDT-RISK-4. **GAP** (sin test vivo: depende del borde de buffer).
- **AQ2#33** (tech-debt, low): debug code en prod — la tecla `<` abre `editMedia` con un
  mediaId hardcodeado (`detail.coffee`). Riesgo LEDT-RISK-6. **GAP** (disparar editMedia
  traería un media ajeno).
- **AQ2#34** (ux, low): "New Media" crea y persiste media de inmediato sin confirmación y
  "Back" no la elimina → media huérfana (reproduce en video y audio). Riesgo LEDT-RISK-7,
  AC LEDT-AC-12. **GAP** (remedio abierto; test UI pesado/acoplado). Evidencia en
  `reports/live-editor/audio-2026-06-26/`.
