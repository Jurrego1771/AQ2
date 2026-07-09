## Resumen

Un live creado por API (POST /api/live-stream/) tiene `entry_points.primary` y `entry_points.backup` como **arrays vacios** en el GET subsecuente. Solo el "Save changes" del UI popula el array con las URLs RTMP/ingest reales (formato `rtmp://origin-{region}.origin.mdstrm.com/.../stream_id_<profile>`).

Esto bloquea cualquier flujo de ingesta via API: tests que quieren enviar senal RTMP real (con ffmpeg) no pueden obtener la URL, y los readers de `origin_url` ven "undefined".

## Pasos de reproduccion

1. `POST /api/live-stream/` con `{name, type:'video'}` -> 200, devuelve `_id` y `stream_id`.
2. `GET /api/live-stream/:id` -> 200, `data.entry_points.primary = []`, `data.entry_points.backup = []`.
3. `POST /api/live-stream/:id` con un update cualquiera (e.g., `{name: 'otro'}`) -> 200, pero `entry_points` sigue vacio.
4. `POST /api/live-stream/:id` con campos completos (encoding_profiles, is_published, etc.) -> 200, pero `entry_points` sigue vacio.
5. `GET /api/live-stream/:id` despues de 10s de espera -> 200, `entry_points` sigue vacio.

## Expected

`entry_points.primary` deberia contener al menos 1 entry por encoding profile activo, con `url` formato `rtmp://origin-{us|cl|br|eu}.origin.mdstrm.com/<app>/<stream_id>_<profile>`. Esto es lo que el UI save produce (verificado en live `6a15a57ea23b8b92586bf11c` "Full RTMP": tiene `entry_points.primary[0].url = rtmp://...`).

## Actual

`entry_points.primary = []`, `entry_points.backup = []`. El campo `origin_url` (campo independiente para los pre-save) muestra `.../undefined/live-stream/undefined/media.m3u8`.

## Impacto

- **No se puede probar ingesta end-to-end via API** (RTMP/WebDAV/Cloud Transcoding) porque las URLs no se generan.
- **No se pueden automatizar flujos de publicacion** que dependen de la URL (clientes externos que reciben la URL del API quedan con undefined).
- **Tests de contrato pasan vacios** (estructura OK) pero el contenido no se valida.

## Evidencia

- `tests/api/live-stream-ingest.api.spec.js`: 4 pruebas vivas (LIVE-TC-108, 109, 110, 115) que esperan contenido en `entry_points` y fallan al verificarlo.
- Reproduccion manual via script `node -e "..."` con API client autenticado por storageState.

## Causa probable (sin acceso al codigo fuente de sm2)

El handler de `POST /:id` (update) parece NO invocar el codigo que crea las entry points (probablemente un `createOrUpdateIngestEndpoints` que solo se llama desde el form save del UI CoffeeScript). El `stream_id` y `publishing_token` SI se generan, pero las URLs derivadas no.

## Heuristica violada

Nielsen #5 (prevencion de errores) + consistencia API/UI: el mismo recurso creado de dos formas distintas termina en estados distintos.

## Fix sugerido

1. Localizar el handler que crea las entry points (probablemente `live_stream.coffee` save() o un util llamado desde ahi).
2. Verificar que el endpoint `POST /:id` (update) lo invoque con los mismos argumentos que el form UI.
3. Alternativa: exponer un endpoint explicito `POST /:id/reprocess-ingest` que se pueda llamar tras create/update.

## Pruebas vivas (rojo-esperado hasta fix)

- `LIVE-TC-108`: cada entry de primary tiene profile (string) y url (string) — `test.fail()`
- `LIVE-TC-109`: urls formato `rtmp://origin-{region}.origin.mdstrm.com/...` — `test.fail()`
- `LIVE-TC-110`: urls contienen stream_id del live — `test.fail()`
- `LIVE-TC-115`: RTMP real con ffmpeg (live pasa a online=true) — `test.fail()` (no se puede obtener URL)
