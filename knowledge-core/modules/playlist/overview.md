# Playlist — Overview estructural (mapa del módulo)

> Colección de medias agrupadas bajo un **type** (manual / smart / series / playout),
> reproducible por el player. **No es un módulo top-level**: el form vive en
> `/playlist/:id` y el listado es un panel lateral dentro de `/media`. Conocimiento
> **estructural** (barato/estable) aquí; el **comportamiento** vive en `historias.yaml`
> (AC) y `riesgos.yaml`. La verdad es el entorno corriendo, no los `.coffee`.

Prefijo de IDs: **PLST** · Épica: `playlist-management`. Entorno verificado: dev, v7.0.70.

## Rutas y vistas
- **No existe** ruta de listado propia: `/playlist` devuelve **404** (bug #37). El
  breadcrumb "Playlist" del form apunta ahí → back-link roto.
- Form (crear/editar): `/playlist/:id` con `:id="new"` para crear. Tras crear con éxito
  redirige a `/playlist/<id>`.
- Listado: panel lateral **`[sm=playlist-list]`** dentro de `/media` (`<ul>` con un
  `<li><a href="/playlist/<id>">` por playlist; los ítems **no** tienen marca sm:).

## Tipos de playlist (`[sm=playlist-type]`)
- **Manual** — lista de medias elegidas a mano (`[sm=manual-media-list]`).
- **Smart** — reglas por filtros: `min_duration`/`max_duration` (+ unidad), `min_views`,
  categorías, tags, orden. Ningún input de regla tiene marca sm: (bug #38).
- **Series** — temporadas (`seasons-list`).
- **Playout** — programación por reglas (`[sm=playout-rule-list]`, `playout-total-duration`).

## Contrato API (verificado en vivo)
Familia `/api/playlist`. Envelope estándar `{status:'OK'|'ERROR', data}`. Acepta el body
como **JSON** y como **form-urlencoded**.

| Método | Ruta | Resultado |
|---|---|---|
| POST | `/api/playlist/` | 200 `{data:{_id,name,type,rules,access_rules,...}}` con `name`; **500 `DB_ERROR`** si `name` vacío (bug #36) |
| GET | `/api/playlist/:id?all=true` | 200 con el objeto completo (`rules.{manual,smart,series,playout}`, `access_rules`) |
| DELETE | `/api/playlist/:id` | 200 `{status:'OK',data:null}` |

Cliente: `src/api/playlist.client.js` (`PlaylistClient`). Fixture: `playlistClient`.
Teardown: `ResourceCleaner` soporta el tipo `playlist` (DELETE /api/playlist/:id).

## Marcas sm: disponibles (cosechadas en vivo)
Form: `playlist-type`, `manual-media-list`, `playout-rule-list`, `playout-total-duration`,
`playlist-image*`, `save`, `delete`. En `/media`: `playlist-list`, `create-smart-playlist`,
`add-to-playlist` (+ `add-to-playlist-form` / `-modal-body` / `-modal-footer`).
**Faltan** (bug #38): inputs Name/Description/Slug/Categories, reglas Smart, e ítems del panel.

## Flujos y estado de cobertura
- **Contrato API** (crear/leer/borrar): cubierto por PLST-TC-1..3 (verdes) + PLST-TC-4
  (vivo, bug #36).
- **UI estructural** (tipo + acciones, panel en /media): PLST-TC-5..6 (verdes) + PLST-TC-7
  (vivo, bug #37).
- **Parcialmente explorado / sin cobertura**: `add-to-playlist` (modal para agregar media a
  una playlist; el disparador es una acción masiva dentro del menú Actions de /media),
  `create-smart-playlist`, y el flujo de captura de datos del form (bloqueado por bug #38).

## Precondiciones
- Sesión iniciada (storageState). El panel de playlists depende del módulo Media.
- Datos de prueba: nombrar `[QA-AUTO] ...` y limpiar por API (ver RISK-4: hay mucha
  playlist huérfana acumulada en dev de corridas previas).
