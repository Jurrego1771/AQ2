# Live Stream — Overview estructural (mapa del módulo)

> Módulo de eventos en vivo (video y audio). Conocimiento **estructural**
> (barato/estable) aquí; el **comportamiento** vive en `historias.yaml` (AC) y
> `riesgos.yaml`, poblado explorando en vivo. La verdad es el entorno corriendo,
> no los `.coffee`.

Prefijo de IDs: **LIVE** · Rutas: listado `/live-stream` (vista `live_streams.coffee`),
detalle/creación `/live-stream/:id` y `/live-stream/new[?type=audio]` (vista
`live_stream.coffee`, ~2.9k líneas). POM del listado: `src/pages/live-stream.page.js`.
Cliente API: `src/api/live-stream.client.js`. Entorno verificado: dev, v7.0.65.

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

## Schedules (de exploración previa — issues ya filados, sin spec aún)
- `POST /:id/schedule-job` acepta **date_end en el pasado** (200; validación server ausente)
  → [[AQ2#18]] (LIVE-RISK-5).
- Schedule **solapado** responde **500** en vez de 400 → [[AQ2#19]] (LIVE-RISK-6).

## Renombrar evento
- Editar el nombre **regenera el slug** (URL pública cambia); `event-slug` es readonly y no
  hay aviso → enlaces compartidos rotos → [[AQ2#17]] (LIVE-RISK-4).

## Secciones del detalle (no todas exploradas a fondo)
Recording, AI Live Transcription, Schedules/EPG, Advertising (Default/Referrer) + Ad Insertion
(Google DAI), Logo, Background image, Thumbnails, Access Restrictions (rule/concurrency),
Distribution Policy, PlayAnywhere, Basic Information, Producers, Playout, Metadata (Icecast),
ITG, Next Settings, Custom Attributes, Encoder, Publishing (Encoding Profiles, Rendition Rules,
publishing points RTMP/WebDAV/MediaPackage/Cloud Transcoding, Stream URLs, Publishing Token),
Embed. Marcas en `selectors.yaml`.

## Testabilidad
- Contar por `total-live-streams` (no por cards: dependen del layout activo).
- Provisioning self-contained posible vía `POST /api/live-stream/` + `DELETE /api/live-stream/:id`
  (verificado: DELETE → 200 OK). Limpiar siempre los `[QA-...]` creados (hay mucha data residual
  en dev de corridas previas — higiene pendiente, no es bug de producto).
- Sesión por `storageState`; endpoints autorizados por cookie de sesión (sin token aparte).
