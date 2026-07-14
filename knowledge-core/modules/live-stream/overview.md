# Live Stream — Overview estructural (mapa del módulo)

> Módulo de eventos en vivo (video y audio). Conocimiento **estructural**
> (barato/estable) aquí; el **comportamiento** vive en `historias.yaml` (AC) y
> `riesgos.yaml`, poblado explorando en vivo. La verdad es el entorno corriendo,
> no los `.coffee`.

**Actualización 2026-07-09** (sesión de cobertura de secciones inexploradas):
- Cosecha de marcas del detalle en dev v7.0.75 → 207 nodos / 180 marcas únicas.
- POM nuevo del detalle: `src/pages/live-stream-detail.page.js`.
- Spec nuevo: `tests/regression/live-stream/live-stream-detail-unexplored.regression.spec.js`
  (LIVE-TC-116..123; 3 verdes + 5 vivos por issues AQ2#50/#51/#52/#53/#54).
- Riesgos nuevos: `LIVE-RISK-17` (TypeError consola), `LIVE-RISK-14` (404 `/records`),
  `LIVE-RISK-15` (AI Live Transcription sin sm:), `LIVE-RISK-16` (Playout y Next Settings
  sin sm:).

**Actualización 2026-07-09** (cobertura del fix sm2#8496 /schedule/:sid):
- Tests nuevos `LIVE-TC-124..127` en `tests/api/integration/live-stream/live-stream-schedule-edge.integration.spec.js`
  (happy path + 2 casos del fix + auth). Método nuevo `schedule(id, sid)` en
  `src/api/live-stream.client.js` para el endpoint singular `/schedule/:sid`
  (distinto de `/schedule-job/:sid`, que ya tenía `scheduleJob()`).
- Apretados al nuevo comportamiento: `LIVE-TC-62` y `LIVE-TC-71` antes toleraban
  `[200, 404]` (cubrían el bug latente como aceptable); ahora assert `404`
  estricto. Verificado en dev que ambos casos ya devuelven 404 (el patrón
  latente de `LIVE-RISK-18` no se manifiesta en estos 2 escenarios concretos,
  aunque el code smell sigue siendo válido para filtros que no matchean).
- Riesgo nuevo `LIVE-RISK-18`: documenta el patrón latente `find()+truthy` en
  3 endpoints hermanos del fix (schedule/index.js, schedule-job/getScheduleJobs.js,
  routes-embed/api/live-stream/schedule.js) — fuera del scope del PR pero
  probablemente con el mismo bug silencioso.

Prefijo de IDs: **LIVE** · Rutas: listado `/live-stream` (vista `live_streams.coffee`),
detalle/creación `/live-stream/:id` y `/live-stream/new[?type=audio]` (vista
`live_stream.coffee`, ~2.9k líneas). POM del listado: `src/pages/live-stream.page.js`.
Cliente API: `src/api/live-stream.client.js`. Entorno verificado: dev, v7.0.65.
**Regla al explorar en vivo**: crear un live nuevo por API (fixture `liveStream` en tests, o
`POST /api/live-stream/` directo al explorar con MCP) y borrarlo al terminar — nunca reusar
lives existentes en el entorno (pueden estar en uso para otros tests).

## Dos tipos de evento (no confundir)
Diferenciados por `isAudio` en el cliente (`@eventType = 'audio' | 'video'`).

| Aspecto | Video (`/new`) | Audio (`/new?type=audio`) |
|---|---|---|
| Encoding | encoding-profiles con codec/bitrate de **video** | controles de codec/bitrate de video **ocultos** (lógica `data-type="video"`) |
| Streaming | HLS/MPD/Embed | + **Icecast** (`stream-url-icecast`) y **metadata mask** (`metadata-icecast-mask`) |
| Player | Default/video | mismos selects (incluye Radio/Radio Standalone) |

Botones de alta en el listado: **New Video Stream** (`/live-stream/new`) y
**New Audio Stream** (`/live-stream/new?type=audio`).

## Listado `/live-stream`
- API: `GET /api/live-stream?all=true&limit=12&skip=0&query=&monitor=&online=&count=true`
  (doble request: count + data; mismo patrón que media). `&type=video|audio` particiona.
- **3 layouts coexisten** (grid/list/minimal); el activo por defecto observado es **list**.
  La marca de card `live-container-<id>` existe **solo en grid**; `bookmark-<id>` está en
  **todos** los layouts → es la marca estable por-card. El **contador `total-live-streams`**
  refleja el total real de la API y es la señal de conteo recomendada.
- Filtros: chips Video/Audio/Favorites (`top-filter`) y Published/Not Published/Online/Offline
  (`top-filter-dropdown`). **Smell**: marcas no únicas → por índice (AQ2#22).
- Datos verificados en vivo: total=79, video=77, audio=2 (77+2=79), query=Radio→1.

## Creación (verificado en vivo)
- `POST /api/live-stream/` crea; el **slug se genera server-side** desde el nombre
  (`[QA-EXPLORE] Video Stream Probe` → `qa-explore-video-stream-probe`).
- El **Status nace en Published** (`status="on"`) en un evento nuevo.
- Guardar **sin CDN zone** dispara un confirm nativo: *"No CDN Zone has been selected.
  This will render your live signal unplayable. Are you sure?"* (buen control, Nielsen #5).
- **Pre-save**: Origin URL muestra `.../undefined/live-stream/undefined/media.m3u8` y Embed
  `.../live-stream/new` (placeholders rotos → AQ2#21); tras guardar toman valores reales.

## Contrato de endpoints del evento (id inválido)
Con un id no-ObjectId (el literal `new`):
- `GET /api/live-stream/new` → **404 NOT_FOUND** ✅
- `GET /api/live-stream/new/schedule-job` → **404 NOT_FOUND** ✅
- `GET /api/live-stream/new/recording` → **500 DB_ERROR** ❌ (Mongoose CastError filtrado;
  no valida el id) → **bug [[AQ2#20]]** (LIVE-RISK-1). Se dispara en cada carga de `/new`.

## Schedules (US-011) — explorado en vivo, cubierto por API
Programación de cuándo un live está al aire. Dos tipos: **onetime** y **recurrent**.

### Contrato API (verificado en vivo)
- **Crear**: `POST /api/live-stream/:id/schedule-job/`.
- **Actualizar**: `POST /api/live-stream/:id/schedule-job/:sid` (**no** es PUT — el cliente
  sm2 hace `$.post` al mismo path con el id).
- **Listar**: `GET /api/live-stream/:id/schedule-job/` — **por defecto filtra `date_end>=now`**;
  usar `?all=true` (incluye pasados) o `?is_past=true` (solo pasados, limit 10).
- **Detalle/Borrar**: `GET`/`DELETE .../schedule-job/:sid`.
- **Campos consultables** (select del server): `name type one_time recurrency date_start
  date_end for_recording is_featured is_auto_publish not_sellable is_blackout is_future
  is_past is_current access_rules delayedContent ignoreSongMetadata
  inherit_ignore_song_metadata show_info`.

### Reglas verificadas (en vivo)
| Caso | Resultado | Estado |
|---|---|---|
| onetime válido futuro | 200, persiste | ✅ LIVE-TC-8 |
| recurrent válido (≤1 año) | 200, `recurrency` persiste | ✅ LIVE-TC-9 |
| recurrent **>1 año** | **400** `OVER_MAX_DURATION` | ✅ LIVE-TC-10 (límite 1 año OK) |
| onetime **fin en pasado** | **200** (`is_past:true`) | 🔴 [[AQ2#18]] LIVE-RISK-5 / LIVE-TC-11 |
| schedule **solapado** | **500** `OVERLAPPED_DATES` | 🔴 [[AQ2#19]] LIVE-RISK-6 / LIVE-TC-12 |
| update vacía texto / apaga flag | no persiste (queda valor previo) | 🔴 [[AQ2#23]] LIVE-RISK-7 / LIVE-TC-13 |

- **Solape**: la validación existe (`checkDateConflict` → `CustomError(...,400)`) pero se pierde
  el status dentro de `mongoose.runInTransaction` → 500. La UI no previene el solape
  client-side: hace POST y muestra alert según la respuesta del server.
- **Update no persiste vaciado**: `updateSchedule` aplica campos con guardas `if(body.X)` →
  `description:''` e `is_featured:false` se ignoran (no se puede limpiar texto ni apagar flags).

### Cobertura UI bloqueada (testabilidad)
El form New/Edit Schedule **casi no tiene marcas `sm`** (solo `scheduleTitle`, `save`, `delete`,
`main-information`). Tipo onetime/recurrent, fechas, horas, días de recurrencia, duración y
opciones (Featured/Blackout/Not Sellable/Monetizable…) **no son direccionables por `sm`**
→ [[AQ2#24]] (LIVE-RISK-8). Por eso la cobertura de schedules es **solo por API**.

## Renombrar evento
- Editar el nombre **regenera el slug** (URL pública cambia); `event-slug` es readonly y no
  hay aviso → enlaces compartidos rotos → [[AQ2#17]] (LIVE-RISK-4).

## Secciones del detalle (no todas exploradas a fondo)
Recording, AI Live Transcription, Schedules/EPG, Advertising (Default/Referrer) + Ad Insertion
(Google DAI), Logo, Background image, Thumbnails, Access Restrictions (rule/concurrency),
Distribution Policy, PlayAnywhere, Basic Information, Producers, Playout, Metadata (Icecast),
ITG, Next Settings, Custom Attributes, Encoder, Publishing (Encoding Profiles, Rendition Rules,
publishing points RTMP/WebDAV/MediaPackage/Cloud Transcoding, Stream URLs, Publishing Token),
Embed. Marcas en `selectors.yaml`. **Quiz Manager** (pestaña propia del detalle) se movió a
módulo aparte, explorado en vivo — ver `modules/quiz-manager/` (PFX QUIZ), compartido con media.

## Distribution Policy / "Show in OTT" — investigación (2026-07-03)
Disparado por un reporte de cliente (TV Azteca): un campo "Show in OTT" volvió a `false` al
aplicar una política de distribución no relacionada, en un evento en vivo crítico. Se creó un
live-stream nuevo por API (`POST /api/live-stream/`, borrado al terminar — nunca se reusan
lives existentes para esto) y se exploró en vivo `[sm="distribution-policy"]`:
- El `<select>` de Distribution Policy (`sm="distribution-policy"`) SÍ tiene marca `sm:` propia.
- **Descartado**: el toggle `sm="status"` (Published/Not Published) NO participa del flujo de
  guardado general — es una acción independiente que dispara `POST /toggle-online` de inmediato,
  confirmado leyendo `live_stream.coffee` (`save()` nunca envía este campo).
- **Descartado**: `next_settings.always_on` (candidato inicial por nombre) está protegido
  server-side con guardas `if (req.body?.campo)` — si el campo no llega en el POST, el server no
  lo toca. No reproduce el patrón "hidratación incompleta → se resetea a false".
- **No se encontró** ningún campo literal "OTT" en el DOM ni en la respuesta cruda de
  `GET /api/live-stream/:id` de un live nuevo en la cuenta de dev/QA.
- **Hipótesis más fuerte** (confirmada por lectura de código, no por UI): "Show in OTT" es
  probablemente un **Custom Attribute** configurado específicamente para la cuenta TV Azteca
  (no existe en dev genérico, que no tiene custom attributes configurados). Ver
  `cross-cutting/custom-attributes/` — el mecanismo de guardado automático e incondicional de
  custom attributes en cada Save Changes, sin control de concurrencia, es el candidato más
  plausible a mecanismo real del incidente. Riesgo compartido: **LIVE-RISK-9** → `ATTR-RISK-001`.
- **Pendiente**: confirmar el nombre literal del campo o conseguir acceso a una cuenta con
  custom attributes configurados para explorar en vivo y escribir un test real.

## Testabilidad
- Contar por `total-live-streams` (no por cards: dependen del layout activo).
- **Provisioning self-contained**: fixture `liveStream` (crea por `POST /api/live-stream/` y borra
  por `DELETE /api/live-stream/:id` al terminar, vía `ResourceCleaner` con deleter `live-stream`).
  El DELETE del live **borra en cascada** sus schedules. Probado por `LIVE-TC-14`.
- **Timeout del contexto API = 30s** (no el `actionTimeout` de 10s de UI): un `POST` de creación
  contra el dev compartido bajo carga paralela puede tardar >10s. Sin este ajuste, el create
  expira en el cliente *después* de crear el recurso en el server → **live huérfano** (causa de la
  data residual `[QA-AUTO]` de corridas previas; no es bug de producto).
- Sesión por `storageState`; endpoints autorizados por cookie de sesión (sin token aparte).
- **Cobertura solo-API** para schedules (form sin marcas `sm`, [[AQ2#24]]).
