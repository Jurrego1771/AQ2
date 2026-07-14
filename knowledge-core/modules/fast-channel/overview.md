# Fast Channel — Overview estructural (mapa del módulo)

> Conocimiento **estructural/factual** aquí; el comportamiento vive en `historias.yaml` (AC)
> y `riesgos.yaml`. Módulo nuevo (2026-07-14). Prefijo de IDs: **FCH**.
> **Cobertura**: 8 tests API (FCH-TC-1..8, create + vínculo live + opciones + schedule + 2
> bugs vivos #56). GAP: sincronización completa publish→live schedule-jobs (FCH-RISK-1).

## Qué es
Un **Fast Channel** es un canal lineal (FAST) armado con **programación a partir de VODs**.
Al crear un fast channel se crea un **live-stream vinculado** (`Event`); cada cambio de
programación en el fast channel se **sincroniza como schedule(s)** en ese live. Ese es el
comportamiento central a proteger (sincronización programación ↔ schedules del live).

## Arquitectura (clave)
- UI: **`/fast-channel`** (vista simple) y **`/fast-channel/advanced/...`** (Advanced View,
  la que el equipo promueve para uso real).
- La Advanced View es un **micro-frontend** (v5.2.381, distinto del admin v7.0.75) con un
  **backend SEPARADO**: `https://dev-api.platform.mediastre.am/fast-channel/...` (NO el `/api/`
  del admin, y NO está en el repo sm2 — es otro servicio).
- **Auth**: header **`x-api-token: <JWT>`**. Ese JWT = el token de sesión de botqa y está en la
  **cookie `jwt` del storageState** (`.auth/user.json`); sirve tal cual contra dev-api
  (verificado: GET /fast-channel/advanced → 200). El botón "Set JWT for Dev" de la UI es un
  override manual (prompt), no hace falta para automatizar.
- **Testabilidad**: el micro-frontend **NO expone `sm:` / `data-testid` / `data-name`**
  (deuda). Tests UI deberían usar getByRole/estructura (frágil) — preferir API.

## Modelo del fast channel (`GET /fast-channel/advanced/:id`)
```
{ _id, name, timezone, liveId, channelId (MediaLive), state,
  adBreakMedia, bumperMedia, scte35UseSegments, syncByBlock,
  livePushInfo: { endpoint (rtmp), streamKey } }
```
- **`liveId`** → id del live-stream (Event) vinculado. En sm2, el `Event` tiene
  `fastChannelReference` (ref `FastChannel`) + `medialive._fastChannelUseInternal`.
- `channelId` → canal MediaLive.
- `medialive-info` (`GET /advanced/:id/medialive-info`): `{ channelName, channelId, state }`.

## Endpoints dev-api mapeados (lectura)
| Uso | Endpoint |
|---|---|
| Listado | `GET /fast-channel/advanced` |
| Detalle (incluye liveId) | `GET /fast-channel/advanced/:id` |
| Programación (EPG) | `GET /fast-channel/advanced/:id/schedule` |
| Estado MediaLive | `GET /fast-channel/advanced/:id/medialive-info` |
| Thumbnail | `GET /fast-channel/:id/thumbnail` |
| Fuentes de contenido | `GET /fast-channel/content/{media?type=video, shows?type=tvshow, categories, components}` |

El schedule del fast channel y los schedule-jobs del live vinculado
(`GET /api/live-stream/:liveId/schedule-job`, admin API por sesión) son los dos lados de la
sincronización a comparar.

## Form de creación (modal "Create Fast Channel")
Campos: **Name** (req), **Timezone** (default America/Santiago, 418 tz), **AdBreak Media**
(opcional, en adBreaks), **Bumper Media** (opcional, tiempo libre entre programas), flag
**"Disable SCTE-35 ad markers from live origin"** (checked=MANIFEST / unchecked=SEGMENTS
passthrough; NO cambiable post-creación), flag **"Sync schedules by block"** (default OFF =
schedules sincronizados al Live **por evento individual**; ON = por bloque usando el nombre del
schedule). El texto del flag confirma la regla de sincronización.

## Schedule Editor (`/fast-channel/advanced/schedule/:id`)
Editor **EPG drag&drop**: panel izq de fuentes (Medias/Live/Shows/Components) → se arrastran a
un calendario "Planning" (Day/Week) por franja horaria. Acciones: **Go Live**, **Go Ad Break**,
**Save & Publish** (sincroniza al live vinculado), **Autosave**. Estado DRAFT/STOPPED. Tipos de
bloque: Media, Live, Ad Break, Schedule, Show, Episode.

## Cobertura actual en AQ2
**Ninguna todavía.** F0-F1 completados (arquitectura, modelo, auth, endpoints de lectura,
form de creación, editor). Vínculo base verificado por lectura: el fast channel "prueba create"
tiene su live vinculado (mismo nombre), ambos schedules vacíos.

## GAPs / pendientes (ver riesgos.yaml)
- **Contrato del editor de programación**: capturar el POST que dispara al agregar un VOD /
  Save & Publish (el editor es drag&drop; automatizar el drag es frágil → capturar el contrato
  y programar por API). Es el núcleo del test de sincronización (FCH-RISK-1).
- **Creación por UI no dispara POST** bajo el harness (fricción click/React, sin confirmar como
  bug) — evaluar crear por API una vez capturado el contrato + el DELETE (crea MediaLive real).
- **Endpoint DELETE de fast channel** sin mapear (necesario para tests self-contained).
- **Falta de `sm:`/`data-testid`** en el micro-frontend (deuda de testabilidad).

## Selectores
El micro-frontend no expone marcas `sm:`. Si se hace cobertura UI, usar getByRole/estructura y
reportar la deuda. El enfoque preferido es **API** contra dev-api (x-api-token).
